# Contributing

## Development

| Command | Does |
|---------|------|
| `npm run build` | tsdown → dual ESM/CJS in `dist/` |
| `npm test` | run the offline specs (no network) |
| `npm run test:live` | run the `*.live.test.ts` specs against the live DuckDuckGo API, one file at a time |
| `npm run typecheck` | `tsc --noEmit` over `src/` |
| `npm run code-style:apply` | ESLint fixes, then dprint |
| `npm run code-style:lint` / `code-style:lint:fix` | ESLint |
| `npm run code-style:format` / `code-style:format:check` | dprint |
| `npm run check:exports` | `attw` validates the published export map |

The only runtime dependency is
[`node-http-toolkit`](https://www.npmjs.com/package/node-http-toolkit), which
provides the HTTP layer.

The live specs run against the real DuckDuckGo endpoints, so they require
network access. DuckDuckGo blocks image search after a few back-to-back runs,
so run `test:live` deliberately rather than in a loop.
