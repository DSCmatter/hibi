# Plugin authors

These records identify people who contribute to Hibi plugins. Upstream credits belong in plugin readmes.

[Source: `src/addons/authors.ts`](../../../src/addons/authors.ts)

```typescript
import type { AddonAuthor } from './api'

export const authors = {
  may: { discordId: '1262793452236570667', displayName: 'may' },
  angelo: {
    discordId: '297656178358616064',
    displayName: 'Angelo',
    github: 'angelofallars',
  },
} as const satisfies Record<string, AddonAuthor>
```
