import { monitorEventLoopDelay, performance } from 'node:perf_hooks'
import { app } from 'electron'
import type { NativeAddon } from '../api'
import type { NativeDiagnostics } from './types'

let histogram: ReturnType<typeof monitorEventLoopDelay> | undefined
let previousLoop:
  | ReturnType<typeof performance.eventLoopUtilization>
  | undefined
let sampledCpu = false
function start() {
  if (histogram) return
  histogram = monitorEventLoopDelay({ resolution: 20 })
  histogram.enable()
  previousLoop = performance.eventLoopUtilization()
}
export default {
  id: 'diagnostics',
  methods: {},
  stop() {
    histogram?.disable()
    histogram = undefined
    previousLoop = undefined
    sampledCpu = false
  },
  queries: {
    async start() {
      start()
    },
    async clear() {
      histogram?.reset()
      previousLoop = performance.eventLoopUtilization()
      sampledCpu = false
    },
    async snapshot(): Promise<NativeDiagnostics> {
      start()
      const loop = performance.eventLoopUtilization()
      const utilization = previousLoop
        ? performance.eventLoopUtilization(loop, previousLoop).utilization
        : null
      previousLoop = loop
      const memory = process.memoryUsage()
      const processes = app.getAppMetrics().map((metric) => ({
        pid: metric.pid,
        created: metric.creationTime,
        type: metric.type,
        cpu:
          sampledCpu && Number.isFinite(metric.cpu.percentCPUUsage)
            ? metric.cpu.percentCPUUsage
            : null,
        memoryMiB: metric.memory.workingSetSize / 1024,
      }))
      sampledCpu = true
      return {
        app: {
          version: app.getVersion(),
          electron: process.versions.electron,
          chromium: process.versions.chrome,
          node: process.versions.node,
          platform: process.platform,
          arch: process.arch,
          development: !app.isPackaged && !!process.env.ELECTRON_RENDERER_URL,
        },
        uptime: process.uptime(),
        mainHeapMiB: memory.heapUsed / 1024 ** 2,
        eventLoopUtilization: utilization,
        eventLoopP95: histogram?.count ? histogram.percentile(95) / 1e6 : null,
        eventLoopMax: histogram?.count ? histogram.max / 1e6 : null,
        processes,
        startup: performance
          .getEntries()
          .filter((entry) => entry.name.startsWith('hibi:'))
          .map((entry) => ({
            name: entry.name.slice(5),
            kind: entry.entryType,
            offset: entry.startTime,
            duration: entry.duration,
          })),
      }
    },
  },
} satisfies NativeAddon
