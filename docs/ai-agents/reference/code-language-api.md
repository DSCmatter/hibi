# Code language API

Add syntax highlighting for source files and code blocks.

[Source: `src/shared/syntax.ts`](../../../src/shared/syntax.ts)

```typescript
import type { Language } from '@codemirror/language'

/** One parser serves source fences, rich code blocks, and static exports. */
export type CodeLanguage = {
  id: string
  aliases?: readonly string[]
  language: Language
}
```
