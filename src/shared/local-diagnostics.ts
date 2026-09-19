// Local diagnostics never accept free-form metadata or document identifiers.
export const DIAGNOSTIC_SCHEMA = 1
export const DIAGNOSTIC_CHANNEL = 'hibi:local-diagnostics'
export const DIAGNOSTIC_REPORT_CHANNEL = 'hibi:local-diagnostic-report'
export type DiagnosticProfile = 'release' | 'debug'
export const diagnosticPolicies = {
  release: {
    frames: 12,
    recordBytes: 4096,
    segmentBytes: 1024 * 1024,
    mainBytes: 128 * 1024,
    mainRecords: 256,
    producerBytes: 32 * 1024,
    producerRecords: 32,
    detailsPerSecond: 4,
  },
  debug: {
    frames: 24,
    recordBytes: 8192,
    segmentBytes: 2 * 1024 * 1024,
    mainBytes: 256 * 1024,
    mainRecords: 512,
    producerBytes: 64 * 1024,
    producerRecords: 64,
    detailsPerSecond: 8,
  },
} as const
export const diagnosticLimits = {
  segments: 4,
  summaryBytes: 64 * 1024,
  markerBytes: 4096,
  batchBytes: 16 * 1024,
  batchRecords: 16,
  flushMs: 250,
  stackUnits: 32 * 1024,
  stackLines: 64,
  counter: 1_000_000,
} as const

// Keys and labels are application-owned, never derived from an exception.
export const diagnosticEvents = {
  RUN_STARTED: { severity: 'info', producer: false, critical: false },
  RUN_ENDED: { severity: 'info', producer: false, critical: false },
  PREVIOUS_RUN_UNCONFIRMED: {
    severity: 'warning',
    producer: false,
    critical: true,
  },
  MAIN_EXCEPTION: { severity: 'error', producer: false, critical: true },
  RENDERER_ERROR: { severity: 'error', producer: true, critical: false },
  RENDERER_REJECTION: { severity: 'error', producer: true, critical: false },
  REACT_RENDER_FAILED: { severity: 'error', producer: true, critical: false },
  PRELOAD_ERROR: { severity: 'error', producer: false, critical: true },
  RENDERER_GONE: { severity: 'error', producer: false, critical: true },
  CHILD_GONE: { severity: 'error', producer: false, critical: true },
  WINDOW_UNRESPONSIVE: {
    severity: 'warning',
    producer: false,
    critical: false,
  },
  WINDOW_RESPONSIVE: { severity: 'info', producer: false, critical: false },
  SOURCE_WORKER_FAILED: { severity: 'error', producer: true, critical: false },
  WORD_COUNT_WORKER_FAILED: {
    severity: 'error',
    producer: true,
    critical: false,
  },
  ANALYSIS_PROCESS_FAILED: {
    severity: 'error',
    producer: false,
    critical: true,
  },
  COMPILER_PROCESS_FAILED: {
    severity: 'error',
    producer: false,
    critical: true,
  },
  SERVICE_STARTED: { severity: 'debug', producer: false, critical: false },
  SERVICE_STOPPED: { severity: 'debug', producer: false, critical: false },
  DIAGNOSTICS_DROPPED: { severity: 'warning', producer: true, critical: false },
} as const
export type DiagnosticCode = keyof typeof diagnosticEvents
export type SafeFrame = readonly [
  moduleId: number,
  line: number,
  column: number,
]
export const stackStatuses = [
  'captured',
  'omitted-untrusted',
  'truncated',
  'unavailable',
  'unavailable-native',
] as const
export type StackStatus = (typeof stackStatuses)[number]
const safeErrorCodes = [
  'ENOENT',
  'EACCES',
  'EPERM',
  'ENOSPC',
  'EMFILE',
  'EIO',
  'ETIMEDOUT',
] as const
type SafeErrorCode = (typeof safeErrorCodes)[number]
export type SafeDiagnostic = Readonly<{
  code: DiagnosticCode
  stackStatus: StackStatus
  frames?: readonly SafeFrame[]
  errorCode?: SafeErrorCode
  count?: number
}>
export type ArtifactCatalog = ReadonlyMap<string, number>

export function diagnosticCode(value: unknown): value is DiagnosticCode {
  return typeof value === 'string' && Object.hasOwn(diagnosticEvents, value)
}

const positive = (value: unknown, maximum: number): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value > 0 &&
  value <= maximum

// The input is a primitive string. JSON.parse creates inert data, so validation
// cannot call an input object's getters, proxy traps, coercion or toJSON.
export function decodeDiagnostic(
  wire: unknown,
  profile: DiagnosticProfile,
  producer = false,
): SafeDiagnostic | null {
  const policy = diagnosticPolicies[profile]
  if (
    typeof wire !== 'string' ||
    wire.length > policy.recordBytes ||
    !/^[\x20-\x7e]*$/.test(wire)
  )
    return null
  try {
    const data = JSON.parse(wire)
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null
    const keys = Object.keys(data)
    if (
      keys.length > 5 ||
      keys.some(
        (key) =>
          !['code', 'stackStatus', 'frames', 'errorCode', 'count'].includes(
            key,
          ),
      )
    )
      return null
    const code: unknown = data.code
    if (
      !diagnosticCode(code) ||
      (producer && !diagnosticEvents[code].producer)
    )
      return null
    if (!stackStatuses.includes(data.stackStatus)) return null
    if (
      data.errorCode !== undefined &&
      !safeErrorCodes.includes(data.errorCode)
    )
      return null
    if (
      data.count !== undefined &&
      !positive(data.count, diagnosticLimits.counter)
    )
      return null
    if (
      data.frames !== undefined &&
      (!Array.isArray(data.frames) ||
        data.frames.length > policy.frames ||
        data.frames.some(
          (frame: unknown) =>
            !Array.isArray(frame) ||
            frame.length !== 3 ||
            !positive(frame[0], 4096) ||
            !positive(frame[1], 100_000_000) ||
            !positive(frame[2], 100_000_000),
        ))
    )
      return null
    if (data.stackStatus === 'captured' && !data.frames?.length) return null
    if (
      data.frames?.length &&
      !['captured', 'truncated'].includes(data.stackStatus)
    )
      return null
    return data as SafeDiagnostic
  } catch {
    return null
  }
}

export function projectStack(
  stack: unknown,
  catalog: ArtifactCatalog,
  profile: DiagnosticProfile,
): Pick<SafeDiagnostic, 'frames' | 'stackStatus'> {
  if (typeof stack !== 'string') return { stackStatus: 'unavailable' }
  if (stack.length > diagnosticLimits.stackUnits)
    return { stackStatus: 'truncated' }
  const frames: SafeFrame[] = []
  const lines = stack.split('\n', diagnosticLimits.stackLines + 1)
  let truncated = lines.length > diagnosticLimits.stackLines
  for (const raw of lines.slice(0, diagnosticLimits.stackLines)) {
    if (raw.length > 1024) {
      truncated = true
      continue
    }
    const text = raw.trim()
    if (!text.startsWith('at ') || text.includes('eval at ')) continue
    let location = text.slice(3)
    if (location.endsWith(')')) {
      const start = location.lastIndexOf('(')
      if (start < 0) continue
      location = location.slice(start + 1, -1)
    }
    const last = location.lastIndexOf(':')
    const previous = location.lastIndexOf(':', last - 1)
    if (previous < 0) continue
    const moduleId = catalog.get(location.slice(0, previous))
    const lineText = location.slice(previous + 1, last)
    const columnText = location.slice(last + 1)
    if (
      !moduleId ||
      !/^\d{1,9}$/.test(lineText) ||
      !/^\d{1,9}$/.test(columnText)
    )
      continue
    const line = Number(lineText),
      column = Number(columnText)
    if (
      !positive(moduleId, 4096) ||
      !positive(line, 100_000_000) ||
      !positive(column, 100_000_000)
    )
      continue
    if (frames.length === diagnosticPolicies[profile].frames) {
      truncated = true
      break
    }
    frames.push([moduleId, line, column])
  }
  return frames.length
    ? { frames, stackStatus: truncated ? 'truncated' : 'captured' }
    : { stackStatus: truncated ? 'truncated' : 'omitted-untrusted' }
}

const nativeError = (
  Error as ErrorConstructor & { isError?: (value: unknown) => boolean }
).isError
// V8's lazy stack getter can invoke arbitrary formatting. Only inert, already
// materialized own stack data is supported here. Browser ErrorEvent locations
// provide a separate original first-frame source without formatting an Error.
export function projectError(
  error: unknown,
  catalog: ArtifactCatalog,
  profile: DiagnosticProfile,
): Pick<SafeDiagnostic, 'frames' | 'stackStatus' | 'errorCode'> {
  if (!nativeError?.(error)) return { stackStatus: 'omitted-untrusted' }
  const stack = Object.getOwnPropertyDescriptor(error, 'stack')
  const code = Object.getOwnPropertyDescriptor(error, 'code')
  const errorCode =
    code && 'value' in code && safeErrorCodes.includes(code.value)
      ? (code.value as SafeErrorCode)
      : undefined
  return {
    ...(stack && 'value' in stack
      ? projectStack(stack.value, catalog, profile)
      : { stackStatus: 'omitted-untrusted' as const }),
    ...(errorCode ? { errorCode } : {}),
  }
}

export function projectLocation(
  url: unknown,
  line: unknown,
  column: unknown,
  catalog: ArtifactCatalog,
): Pick<SafeDiagnostic, 'frames' | 'stackStatus'> {
  const moduleId =
    typeof url === 'string' && url.length <= 1024 ? catalog.get(url) : undefined
  return moduleId &&
    positive(moduleId, 4096) &&
    positive(line, 100_000_000) &&
    positive(column, 100_000_000)
    ? { frames: [[moduleId, line, column]], stackStatus: 'captured' }
    : { stackStatus: 'omitted-untrusted' }
}

export const incrementDiagnosticCount = (count: number, amount = 1) =>
  Math.min(diagnosticLimits.counter, count + amount)
