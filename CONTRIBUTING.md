# Contributing

## Development

| Command | Does |
|---------|------|
| `npm run build` | tsdown → dual ESM/CJS in `dist/` |
| `npm test` | run all `test/**/*.test.ts` (hits the live DuckDuckGo API) |
| `npm run typecheck` | `tsc --noEmit` over `src/` |
| `npm run lint` / `lint:fix` | ESLint |
| `npm run format` / `format:check` | dprint |
| `npm run check:exports` | `attw` validates the published export map |

The only runtime dependency is
[`node-http-toolkit`](https://www.npmjs.com/package/node-http-toolkit), which
provides the HTTP layer.

The tests run against the live DuckDuckGo endpoints, so they require network
access.
