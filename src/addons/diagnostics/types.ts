export type NativeDiagnostics = {
  app: {
    version: string
    electron: string
    chromium: string
    node: string
    platform: string
    arch: string
    development: boolean
  }
  uptime: number
  mainHeapMiB: number
  eventLoopUtilization: number | null
  eventLoopP95: number | null
  eventLoopMax: number | null
  processes: {
    pid: number
    created: number
    type: string
    cpu: number | null
    memoryMiB: number
  }[]
  startup: { name: string; kind: string; offset: number; duration: number }[]
}
