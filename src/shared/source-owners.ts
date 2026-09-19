/** Coarse, contiguous source owners. Positions live in subtree sums, never on every record. */
export type SourceOwner = Readonly<{
  slot: number
  generation: number
  revision: number
  kind: string
  length: number
  parsed: boolean
}>
type OwnerInput = Pick<SourceOwner, 'kind' | 'length'> & { parsed?: boolean }
type Node = Readonly<{
  count: number
  length: number
  height: number
  invalid: number
}> &
  (
    | Readonly<{ kind: 'page'; entries: readonly SourceOwner[] }>
    | Readonly<{ kind: 'branch'; entries: readonly Node[] }>
  )
export type OwnerIndexOptions = {
  pageSize?: number
  fanout?: number
  firstSlot?: number
}
const fork = Symbol('source owner snapshot')
const safe = (value: number) => Number.isSafeInteger(value) && value >= 0
const add = (a: number, b: number) => {
  const result = a + b
  if (!safe(result))
    throw new Error('Source owner coordinate or generation overflow.')
  return result
}

class OwnerPages {
  readonly pageSize: number
  readonly fanout: number
  readonly epoch = crypto.randomUUID()
  readonly work = {
    visits: 0,
    pagesCopied: 0,
    recordSlotsCopied: 0,
    directorySlotsCopied: 0,
    lookupSlotsRead: 0,
  }
  #nextSlot: number
  constructor(options: OwnerIndexOptions) {
    this.pageSize = options.pageSize ?? 128
    this.fanout = options.fanout ?? 32
    this.#nextSlot = options.firstSlot ?? 1
    if (
      !safe(this.pageSize) ||
      this.pageSize < 4 ||
      this.pageSize > 4096 ||
      !safe(this.fanout) ||
      this.fanout < 4 ||
      this.fanout > 128 ||
      !safe(this.#nextSlot) ||
      !this.#nextSlot
    )
      throw new Error('Invalid source owner page configuration.')
  }
  record(value: OwnerInput, previous?: SourceOwner): SourceOwner {
    if (
      !value ||
      typeof value.kind !== 'string' ||
      !value.kind ||
      value.kind.length > 128 ||
      !safe(value.length) ||
      !value.length ||
      (value.parsed !== undefined && typeof value.parsed !== 'boolean')
    )
      throw new Error('Source owners need a kind and a positive safe length.')
    const slot = previous?.slot ?? this.#nextSlot
    if (!previous) this.#nextSlot = add(slot, 1)
    return Object.freeze({
      slot,
      generation: previous?.generation ?? 1,
      revision: previous ? add(previous.revision, 1) : 0,
      kind: value.kind,
      length: value.length,
      parsed: value.parsed !== false,
    })
  }
  page(entries: readonly SourceOwner[]): Node {
    this.work.pagesCopied++
    this.work.recordSlotsCopied += entries.length
    return Object.freeze({
      kind: 'page',
      entries: Object.freeze([...entries]),
      count: entries.length,
      invalid: entries.reduce((sum, entry) => sum + Number(!entry.parsed), 0),
      length: entries.reduce((sum, entry) => add(sum, entry.length), 0),
      height: 0,
    })
  }
  branch(entries: readonly Node[]): Node {
    this.work.directorySlotsCopied += entries.length
    return Object.freeze({
      kind: 'branch',
      entries: Object.freeze([...entries]),
      count: entries.reduce((sum, entry) => add(sum, entry.count), 0),
      invalid: entries.reduce((sum, entry) => sum + entry.invalid, 0),
      length: entries.reduce((sum, entry) => add(sum, entry.length), 0),
      height: entries[0]!.height + 1,
    })
  }
  groups<T>(entries: readonly T[], maximum: number) {
    const count = Math.ceil(entries.length / maximum),
      groups: T[][] = []
    let from = 0
    for (let index = 0; index < count; index++) {
      const length = Math.ceil((entries.length - from) / (count - index))
      groups.push(entries.slice(from, from + length))
      from += length
    }
    return groups
  }
  build(records: readonly SourceOwner[]) {
    if (!records.length) return this.page([])
    let nodes = this.groups(records, this.pageSize).map((entries) =>
      this.page(entries),
    )
    while (nodes.length > 1)
      nodes = this.groups(nodes, this.fanout).map((entries) =>
        this.branch(entries),
      )
    return nodes[0]!
  }
  normalize(root: Node) {
    while (root.kind === 'branch' && root.entries.length === 1)
      root = root.entries[0]!
    return root
  }
  joinNodes(left: Node, right: Node): Node[] {
    this.work.visits += 2
    if (left.height === right.height) {
      if (left.kind === 'page' && right.kind === 'page')
        return this.groups(
          [...left.entries, ...right.entries],
          this.pageSize,
        ).map((entries) => this.page(entries))
      if (left.kind !== 'branch' || right.kind !== 'branch')
        throw new Error('Inconsistent source owner heights.')
      const middle = this.joinNodes(left.entries.at(-1)!, right.entries[0]!)
      return this.groups(
        [...left.entries.slice(0, -1), ...middle, ...right.entries.slice(1)],
        this.fanout,
      ).map((entries) => this.branch(entries))
    }
    if (left.height > right.height && left.kind === 'branch') {
      const tail = this.joinNodes(left.entries.at(-1)!, right)
      return this.groups(
        [...left.entries.slice(0, -1), ...tail],
        this.fanout,
      ).map((entries) => this.branch(entries))
    }
    if (right.kind !== 'branch')
      throw new Error('Inconsistent source owner heights.')
    const head = this.joinNodes(left, right.entries[0]!)
    return this.groups([...head, ...right.entries.slice(1)], this.fanout).map(
      (entries) => this.branch(entries),
    )
  }
  join(left: Node | null, right: Node | null): Node {
    if (!left?.count) return right ? this.normalize(right) : this.page([])
    if (!right?.count) return this.normalize(left)
    const nodes = this.joinNodes(this.normalize(left), this.normalize(right))
    return this.normalize(nodes.length === 1 ? nodes[0]! : this.branch(nodes))
  }
  half(entries: Node[], edge: 'first' | 'last'): Node | null {
    if (!entries.length) return null
    if (entries.length > 1) {
      const index = edge === 'first' ? 0 : entries.length - 1,
        child = entries[index]!
      if (
        child.entries.length <
        Math.ceil((child.kind === 'page' ? this.pageSize : this.fanout) / 2)
      ) {
        const start = edge === 'first' ? 0 : index - 1
        entries.splice(
          start,
          2,
          ...this.joinNodes(entries[start]!, entries[start + 1]!),
        )
      }
    }
    return this.branch(entries)
  }
  split(node: Node, at: number): [Node | null, Node | null] {
    this.work.visits++
    if (at === 0) return [null, node]
    if (at === node.count) return [node, null]
    if (node.kind === 'page')
      return [
        this.page(node.entries.slice(0, at)),
        this.page(node.entries.slice(at)),
      ]
    let offset = 0
    for (let index = 0; index < node.entries.length; index++) {
      const child = node.entries[index]!,
        end = offset + child.count
      if (at <= end) {
        const [left, right] = this.split(child, at - offset)
        return [
          this.half(
            [...node.entries.slice(0, index), ...(left ? [left] : [])],
            'last',
          ),
          this.half(
            [...(right ? [right] : []), ...node.entries.slice(index + 1)],
            'first',
          ),
        ]
      }
      offset = end
    }
    throw new Error('Source owner split is outside its index.')
  }
}

/** Immutable paged order/position index; handle slots are never recycled in an epoch. */
export class SourceOwners {
  readonly #pages: OwnerPages
  readonly #root: Node
  readonly epoch: string
  constructor(
    records: readonly OwnerInput[],
    options: OwnerIndexOptions = {},
    internal?: { token: typeof fork; pages: OwnerPages; root: Node },
  ) {
    if (internal && internal.token !== fork)
      throw new Error('Invalid source owner snapshot capability.')
    this.#pages = internal?.pages ?? new OwnerPages(options)
    this.#root =
      internal?.root ??
      this.#pages.build(records.map((record) => this.#pages.record(record)))
    this.epoch = this.#pages.epoch
    Object.freeze(this)
  }
  get count() {
    return this.#root.count
  }
  get length() {
    return this.#root.length
  }
  invalid(from = 0, to = this.count) {
    if (!safe(from) || !safe(to) || to < from || to > this.count)
      throw new Error('Source owner range is outside its index.')
    const count = (node: Node, start: number): number => {
      this.#pages.work.visits++
      if (start >= to || start + node.count <= from || !node.invalid) return 0
      if (start >= from && start + node.count <= to) return node.invalid
      if (node.kind === 'page')
        return node.entries
          .slice(Math.max(0, from - start), Math.min(node.count, to - start))
          .reduce((sum, owner) => sum + Number(!owner.parsed), 0)
      let result = 0,
        index = start
      for (const child of node.entries) {
        result += count(child, index)
        index += child.count
      }
      return result
    }
    return count(this.#root, 0)
  }
  *pending() {
    function* visit(
      node: Node,
      index: number,
      from: number,
    ): Generator<
      Readonly<{ owner: SourceOwner; index: number; from: number; to: number }>
    > {
      if (!node.invalid) return
      if (node.kind === 'page') {
        for (const owner of node.entries) {
          if (!owner.parsed)
            yield Object.freeze({ owner, index, from, to: from + owner.length })
          index++
          from += owner.length
        }
      } else
        for (const child of node.entries) {
          yield* visit(child, index, from)
          index += child.count
          from += child.length
        }
    }
    yield* visit(this.#root, 0, 0)
  }
  *records(from = 0, to = this.count) {
    if (!safe(from) || !safe(to) || to < from || to > this.count)
      throw new Error('Source owner range is outside its index.')
    const work = this.#pages.work
    function* visit(
      node: Node,
      index: number,
      offset: number,
    ): Generator<
      Readonly<{ owner: SourceOwner; index: number; from: number; to: number }>
    > {
      work.visits++
      if (index >= to || index + node.count <= from) return
      if (node.kind === 'page') {
        for (const owner of node.entries) {
          work.lookupSlotsRead++
          if (index >= from && index < to)
            yield Object.freeze({
              owner,
              index,
              from: offset,
              to: offset + owner.length,
            })
          index++
          offset += owner.length
        }
      } else
        for (const child of node.entries) {
          work.lookupSlotsRead++
          yield* visit(child, index, offset)
          index += child.count
          offset += child.length
        }
    }
    yield* visit(this.#root, 0, 0)
  }
  counters(reset = false) {
    const result = { ...this.#pages.work }
    if (reset)
      Object.assign(this.#pages.work, {
        visits: 0,
        pagesCopied: 0,
        recordSlotsCopied: 0,
        directorySlotsCopied: 0,
        lookupSlotsRead: 0,
      })
    return result
  }
  get(index: number) {
    if (!safe(index) || index >= this.count) return null
    let node = this.#root,
      remaining = index,
      from = 0
    while (node.kind === 'branch') {
      this.#pages.work.visits++
      let next: Node | undefined
      for (const child of node.entries) {
        this.#pages.work.lookupSlotsRead++
        if (remaining < child.count) {
          next = child
          break
        }
        remaining -= child.count
        from += child.length
      }
      node = next!
    }
    this.#pages.work.visits++
    this.#pages.work.lookupSlotsRead += remaining + 1
    for (let at = 0; at < remaining; at++) from += node.entries[at]!.length
    const owner = node.entries[remaining]!
    return Object.freeze({ owner, index, from, to: from + owner.length })
  }
  at(position: number, association: -1 | 1 = 1) {
    if (
      !safe(position) ||
      position > this.length ||
      !this.count ||
      ![-1, 1].includes(association)
    )
      return null
    let target = Math.max(
        0,
        Math.min(this.length - 1, position - Number(association < 0)),
      ),
      node = this.#root,
      index = 0,
      from = 0
    while (node.kind === 'branch') {
      this.#pages.work.visits++
      let next: Node | undefined
      for (const child of node.entries) {
        this.#pages.work.lookupSlotsRead++
        if (target < child.length) {
          next = child
          break
        }
        target -= child.length
        from += child.length
        index += child.count
      }
      node = next!
    }
    this.#pages.work.visits++
    for (const owner of node.entries) {
      this.#pages.work.lookupSlotsRead++
      if (target < owner.length)
        return Object.freeze({ owner, index, from, to: from + owner.length })
      target -= owner.length
      from += owner.length
      index++
    }
    return null
  }
  #replace(from: number, to: number, records: readonly SourceOwner[]) {
    if (!safe(from) || !safe(to) || to < from || to > this.count)
      throw new Error('Source owner edit is outside its index.')
    const [left, tail] = this.#pages.split(this.#root, from),
      right = tail ? this.#pages.split(tail, to - from)[1] : null
    const root = this.#pages.join(
      this.#pages.join(left, this.#pages.build(records)),
      right,
    )
    return new SourceOwners([], {}, { token: fork, pages: this.#pages, root })
  }
  splice(from: number, to: number, records: readonly OwnerInput[]) {
    if (from === to && !records.length && safe(from) && from <= this.count)
      return this
    return this.#replace(
      from,
      to,
      records.map((record) => this.#pages.record(record)),
    )
  }
  update(index: number, value: OwnerInput) {
    const previous = this.get(index)
    if (!previous) throw new Error('Source owner edit is outside its index.')
    return this.#replace(index, index + 1, [
      this.#pages.record(value, previous.owner),
    ])
  }
  inspect() {
    const problems: string[] = [],
      occupancy: number[][] = []
    const visit = (node: Node, root: boolean) => {
      const maximum =
        node.kind === 'page' ? this.#pages.pageSize : this.#pages.fanout
      if (
        node.entries.length > maximum ||
        (!root && node.entries.length < Math.ceil(maximum / 2))
      )
        problems.push('occupancy')
      occupancy[node.height] ??= []
      occupancy[node.height]!.push(node.entries.length)
      if (
        node.length !==
        node.entries.reduce((sum, entry) => sum + entry.length, 0)
      )
        problems.push('length')
      if (
        node.count !==
        (node.kind === 'page'
          ? node.entries.length
          : node.entries.reduce((sum, entry) => sum + entry.count, 0))
      )
        problems.push('count')
      if (
        node.invalid !==
        (node.kind === 'page'
          ? node.entries.reduce((sum, owner) => sum + Number(!owner.parsed), 0)
          : node.entries.reduce((sum, child) => sum + child.invalid, 0))
      )
        problems.push('invalid')
      if (node.kind === 'branch')
        for (const child of node.entries) {
          if (child.height !== node.height - 1) problems.push('height')
          visit(child, false)
        }
    }
    visit(this.#root, true)
    return { height: this.#root.height + 1, occupancy, problems }
  }
}
