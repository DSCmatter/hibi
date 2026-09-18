import { contextBridge, ipcRenderer } from 'electron'
import { ANALYSIS_CHANNELS, MAX_ANALYSIS_RESULT } from '../shared/analysis'

// This bridge only receives a granted snapshot and returns one bounded JSON result.
if (process.isMainFrame) {
  let listen: ((input: unknown) => void) | undefined
  let job: string | null = null
  ipcRenderer.on(
    ANALYSIS_CHANNELS.job,
    (_event, id: string, input: unknown) => {
      job = id
      listen?.({ id, projection: input })
    },
  )
  contextBridge.exposeInMainWorld('analysisHost', {
    start(callback: (input: unknown) => void) {
      if (listen || typeof callback !== 'function') return
      listen = callback
      ipcRenderer.send(ANALYSIS_CHANNELS.ready)
    },
    finish(value: unknown, failed = false) {
      if (!job) return
      const id = job
      job = null
      let json: string
      try {
        json = JSON.stringify(value)
        if (typeof json !== 'string' || json.length > MAX_ANALYSIS_RESULT)
          throw new Error('limit')
      } catch {
        failed = true
        json = '"Analysis returned too much data."'
      }
      ipcRenderer.send(ANALYSIS_CHANNELS.result, id, json, failed === true)
    },
  })
}
