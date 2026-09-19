/** Metrics for the UTF-8 encoding of a JavaScript string, with replacement for lone surrogates. */
export type TextMetrics = Readonly<{
  rawUnits: number
  normalizedUnits: number
  utf8Bytes: number
  breaks: number
  firstUnit: number
  lastUnit: number
}>
export const emptyMetrics: TextMetrics = Object.freeze({
  rawUnits: 0,
  normalizedUnits: 0,
  utf8Bytes: 0,
  breaks: 0,
  firstUnit: -1,
  lastUnit: -1,
})
export const highSurrogate = (unit: number) => unit >= 0xd800 && unit <= 0xdbff
export const lowSurrogate = (unit: number) => unit >= 0xdc00 && unit <= 0xdfff

export function combineMetrics(a: TextMetrics, b: TextMetrics): TextMetrics {
  if (!a.rawUnits) return b
  if (!b.rawUnits) return a
  const crlf = Number(a.lastUnit === 13 && b.firstUnit === 10)
  const pair = Number(highSurrogate(a.lastUnit) && lowSurrogate(b.firstUnit))
  return {
    rawUnits: a.rawUnits + b.rawUnits,
    normalizedUnits: a.normalizedUnits + b.normalizedUnits - crlf,
    utf8Bytes: a.utf8Bytes + b.utf8Bytes - 2 * pair,
    breaks: a.breaks + b.breaks - crlf,
    firstUnit: a.firstUnit,
    lastUnit: b.lastUnit,
  }
}
const encodedUnitBytes = (unit: number, previous: number) =>
  unit < 0x80
    ? 1
    : unit < 0x800
      ? 2
      : lowSurrogate(unit) && highSurrogate(previous)
        ? 1
        : 3

/** Immutable original chunk plus sparse local prefix indexes, shared by split pieces. */
export class SourceChunk {
  readonly text: string
  readonly #stride = 32
  readonly #normalized: Float64Array
  readonly #bytes: Float64Array
  readonly #breaks: Float64Array
  readonly #scanned: (units: number) => void

  constructor(text: string, scanned: (units: number) => void) {
    this.text = text
    this.#scanned = scanned
    const count = Math.floor(text.length / this.#stride) + 1
    this.#normalized = new Float64Array(count)
    this.#bytes = new Float64Array(count)
    this.#breaks = new Float64Array(count)
    let normalized = 0,
      bytes = 0,
      breaks = 0,
      previous = -1
    for (let at = 0; at < text.length; at++) {
      const unit = text.charCodeAt(at)
      const crlf = previous === 13 && unit === 10
      normalized += Number(!crlf)
      breaks += Number(unit === 13 || (unit === 10 && !crlf))
      bytes += encodedUnitBytes(unit, previous)
      previous = unit
      if ((at + 1) % this.#stride === 0) {
        const index = (at + 1) / this.#stride
        this.#normalized[index] = normalized
        this.#bytes[index] = bytes
        this.#breaks[index] = breaks
      }
    }
    scanned(text.length)
    Object.freeze(this)
  }

  #prefix(to: number) {
    const index = Math.floor(to / this.#stride),
      start = index * this.#stride
    let normalized = this.#normalized[index]!,
      bytes = this.#bytes[index]!,
      breaks = this.#breaks[index]!
    let previous = this.text.charCodeAt(start - 1)
    for (let at = start; at < to; at++) {
      const unit = this.text.charCodeAt(at),
        crlf = previous === 13 && unit === 10
      normalized += Number(!crlf)
      breaks += Number(unit === 13 || (unit === 10 && !crlf))
      bytes += encodedUnitBytes(unit, previous)
      previous = unit
    }
    this.#scanned(to - start)
    return { normalized, bytes, breaks }
  }

  metrics(from: number, to: number): TextMetrics {
    if (
      !Number.isSafeInteger(from) ||
      !Number.isSafeInteger(to) ||
      from < 0 ||
      to < from ||
      to > this.text.length
    )
      throw new Error('Invalid source chunk range.')
    if (from === to) return emptyMetrics
    const a = this.#prefix(from),
      b = this.#prefix(to)
    const firstUnit = this.text.charCodeAt(from),
      previous = this.text.charCodeAt(from - 1)
    const crlf = Number(previous === 13 && firstUnit === 10)
    return {
      rawUnits: to - from,
      normalizedUnits: b.normalized - a.normalized + crlf,
      utf8Bytes:
        b.bytes -
        a.bytes +
        2 * Number(highSurrogate(previous) && lowSurrogate(firstUnit)),
      breaks: b.breaks - a.breaks + crlf,
      firstUnit,
      lastUnit: this.text.charCodeAt(to - 1),
    }
  }
}
