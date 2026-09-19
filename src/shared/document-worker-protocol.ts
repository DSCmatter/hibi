import type { SourceOwnerPage } from './markdown-source-model.ts'
import type { DocumentKey, SourceOperation } from './source-operations.ts'
import type { SearchLocation } from './source-search-index.ts'

export type MetadataDialect = 'commonmark' | 'gfm'

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
  | {
      type: 'metadata'
      epoch: string
      id: number
      version: number
      dialect: MetadataDialect
      frontmatter?: boolean
      from: number
      to: number
      limit: number
    }
  | { type: 'cancel-metadata'; epoch: string; id: number; release: boolean }

export type DocumentWorkerReply =
  | { type: 'ack'; epoch: string; version: number }
  | { type: 'canceled'; epoch: string; id: number }
  | { type: 'metadata-canceled'; epoch: string; id: number; release: boolean }
  | {
      type: 'metadata'
      epoch: string
      id: number
      version: number
      page: SourceOwnerPage
    }
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
      stage: 'replica' | 'find' | 'metadata'
      message: string
    }
