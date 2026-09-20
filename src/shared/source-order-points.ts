import type { SourceOwner, SourceOwners } from './source-owners.ts'

type Node = Readonly<{
  slot: number
  left: Node | null
  right: Node | null
  height: number
  count: number
}>
type Work = {
  ownersRead: number
  nodesRead: number
  nodesCreated: number
  comparisons: number
}
const height = (node: Node | null) => node?.height ?? 0
const count = (node: Node | null) => node?.count ?? 0
const node = (
  slot: number,
  left: Node | null,
  right: Node | null,
  work: Work,
): Node => {
  work.nodesCreated++
  return {
    slot,
    left,
    right,
    height: 1 + Math.max(height(left), height(right)),
    count: 1 + count(left) + count(right),
  }
}
const balance = (
  slot: number,
  left: Node | null,
  right: Node | null,
  work: Work,
): Node => {
  if (height(left) > height(right) + 1) {
    const child = left!
    if (height(child.left) >= height(child.right))
      return node(
        child.slot,
        child.left,
        node(slot, child.right, right, work),
        work,
      )
    const pivot = child.right!
    return node(
      pivot.slot,
      node(child.slot, child.left, pivot.left, work),
      node(slot, pivot.right, right, work),
      work,
    )
  }
  if (height(right) > height(left) + 1) {
    const child = right!
    if (height(child.right) >= height(child.left))
      return node(
        child.slot,
        node(slot, left, child.left, work),
        child.right,
        work,
      )
    const pivot = child.left!
    return node(
      pivot.slot,
      node(slot, left, pivot.left, work),
      node(child.slot, pivot.right, child.right, work),
      work,
    )
  }
  return node(slot, left, right, work)
}

/** Immutable semantic membership; owner order supplies positions without suffix rewrites. */
export class SourceOrderPoints {
  readonly #owners: SourceOwners
  readonly #root: Node | null
  readonly #work: Work
  private constructor(owners: SourceOwners, root: Node | null, work: Work) {
    this.#owners = owners
    this.#root = root
    this.#work = work
  }
  /** The predicate must read one completed semantic snapshot throughout preparation. */
  static *build(
    owners: SourceOwners,
    includes: (owner: SourceOwner) => boolean,
  ): Generator<void, SourceOrderPoints> {
    if (owners.invalid())
      throw new Error('Semantic points require complete source owners.')
    yield* owners.prepareLookup()
    const work: Work = {
      ownersRead: 0,
      nodesRead: 0,
      nodesCreated: 0,
      comparisons: 0,
    }
    let total = 0
    for (const row of owners.records()) {
      work.ownersRead++
      if (includes(row.owner)) total++
      yield
    }
    const rows = owners.records()[Symbol.iterator]()
    function* next(): Generator<void, number> {
      for (;;) {
        const step = rows.next()
        if (step.done)
          throw new Error('Semantic membership changed during preparation.')
        work.ownersRead++
        const included = includes(step.value.owner)
        yield
        if (included) return step.value.owner.slot
      }
    }
    function* build(size: number): Generator<void, Node | null> {
      if (!size) return null
      const leftSize = Math.floor(size / 2),
        left = yield* build(leftSize),
        slot = yield* next(),
        right = yield* build(size - leftSize - 1)
      return node(slot, left, right, work)
    }
    try {
      return new SourceOrderPoints(owners, yield* build(total), work)
    } finally {
      rows.return?.(undefined)
    }
  }
  #compare(a: number, b: number) {
    this.#work.comparisons++
    return this.#owners.bySlot(a)!.index - this.#owners.bySlot(b)!.index
  }
  #set(root: Node | null, slot: number, included: boolean): Node | null {
    if (!root) return included ? node(slot, null, null, this.#work) : null
    this.#work.nodesRead++
    const order = this.#compare(slot, root.slot)
    if (!order) {
      if (included) return root
      if (!root.left) return root.right
      if (!root.right) return root.left
      let successor = root.right
      while (successor.left) {
        this.#work.nodesRead++
        successor = successor.left
      }
      return balance(
        successor.slot,
        root.left,
        this.#set(root.right, successor.slot, false),
        this.#work,
      )
    }
    if (order < 0) {
      const left = this.#set(root.left, slot, included)
      return left === root.left
        ? root
        : balance(root.slot, left, root.right, this.#work)
    }
    const right = this.#set(root.right, slot, included)
    return right === root.right
      ? root
      : balance(root.slot, root.left, right, this.#work)
  }
  set(slot: number, included: boolean) {
    if (!this.#owners.bySlot(slot))
      throw new Error('Unknown semantic source owner.')
    return new SourceOrderPoints(
      this.#owners,
      this.#set(this.#root, slot, included),
      this.#work,
    )
  }
  /** Surviving owner slots preserve relative order. New slots start excluded. */
  *adopt(owners: SourceOwners): Generator<void, SourceOrderPoints> {
    if (owners.invalid())
      throw new Error('Semantic points require complete source owners.')
    const changes = owners.changesSince(this.#owners)
    let root = this.#root
    for (const owner of changes.removed) {
      root = this.#set(root, owner.slot, false)
      yield
    }
    return new SourceOrderPoints(owners, root, this.#work)
  }
  bounds() {
    const edge = (side: 'left' | 'right') => {
      let current = this.#root
      if (!current) return null
      while (current[side]) {
        this.#work.nodesRead++
        current = current[side]!
      }
      this.#work.nodesRead++
      const row = this.#owners.bySlot(current.slot)!
      return { owner: row.owner, from: row.from }
    }
    return {
      count: count(this.#root),
      first: edge('left'),
      last: edge('right'),
    }
  }
  counters(reset = false) {
    const result = {
      ...this.#work,
      height: height(this.#root),
      count: count(this.#root),
    }
    if (reset)
      Object.assign(this.#work, {
        ownersRead: 0,
        nodesRead: 0,
        nodesCreated: 0,
        comparisons: 0,
      })
    return result
  }
}
