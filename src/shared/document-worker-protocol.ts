import type { DocumentKey, SourceOperation } from './source-operations.ts'
import type { SearchLocation } from './source-search-index.ts'

export type DocumentWorkerRequest =
  | {
      type: 'load'
      epoch: string
      document: DocumentKey
      version: number
      chunks: readonly string[]
    }
  | { type: 'edit'; epoch: string; operation: SourceOperation }
  | {
      type: 'find'
      epoch: string
      id: number
      version: number
      query: string
      from: number
      to: number
    }
  | { type: 'cancel-find'; epoch: string; id: number }

export type DocumentWorkerReply =
  | { type: 'ack'; epoch: string; version: number }
  | { type: 'canceled'; epoch: string; id: number }
  | {
      type: 'find'
      epoch: string
      id: number
      version: number
      location: SearchLocation
    }
  | {
      type: 'error'
      epoch: string
      id?: number
      stage: 'replica' | 'find'
      message: string
    }
