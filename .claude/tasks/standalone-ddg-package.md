# Standalone DDG Image-Search Package

## Goal

Turn `/Users/lars/dev/projects/ddg-search` into a standalone npm package. The code was
copied verbatim out of a larger music-library app and was full of broken references to
project-internal classes that no longer exist here. The web-request classes the old code
depended on have since been extracted into their own published package,
**`node-http-toolkit`** (installed in `node_modules`, version 1.0.0).

The chosen package shape (confirmed with the user) is a **clean DuckDuckGo image-search
library**, decoupled from the old music-app domain. Only DDG image search is in scope.

## Progress

**Done — the package compiles, lints, formats, and loads at runtime.** Verified:
`tsc=0`, `eslint=0`, `prettier --check src=0`, and `import('./dist/index.js')` exposes
`DuckDuckGoAPI, DuckDuckGoImageSearchEngine, ImageSearchResult`.

What was done:
- Rewired the web layer from the old `AppCore/Web/*` internal classes to
  `node-http-toolkit`: `AsyncResolvingHttpRequest` (follows redirects, rejects on HTTP
  >=400 with `HttpError`), `HttpResponseReader` (buffers + decompresses gzip/deflate/br),
  `HttpMethod`.
- Decoupled the engine from the music domain. The DDG engine now searches by query
  string: `search(query: string): Promise<ImageSearchResult[]>`. Removed all references
  to `Album`, `AlbumService`, `ArtworkService`, `ImageMetadataParser`, `ts-bakery`.
- Removed logging; replaced with thrown errors (user instruction). `generateToken` throws
  when the `vqd` token can't be parsed. Per-option search failures now propagate out of
  `search()` instead of being swallowed by a logger (intentional behavior change:
  fail-fast).
- Renamed `src/ArtworkSearch/` -> `src/ImageSearch/`; `ArtworkSearchEngineResult` ->
  `ImageSearchResult` (fields `thumbnailUrl`/`imageUrl`); `IArtworkSearchEngine` ->
  `IImageSearchEngine`; `DuckDuckGoArtworkSearchEngine` -> `DuckDuckGoImageSearchEngine`.
- Deleted: `ArtworkSearchManager`, `ArtworkSearchModule`, `PreparedArtworkData`,
  `ArtworkSearchResult`, `GoogleArtworkSearchEngine` (the Google engine relied on a
  browser `XMLHttpRequest`/`WebRequest` with no node equivalent; user chose to delete it).
- Added `src/index.ts` barrel; cleaned `package.json` (removed stray `mcp-tools` bin,
  added real description).

## Key Findings

Current source layout:
- `src/index.ts` — barrel. Exports `DuckDuckGoAPI`, `DuckDuckGoImageSearchEngine`,
  `ImageSearchResult` (values) and `IImageSearchEngine` + the `DDG*` option types
  (type-only).
- `src/ImageSearch/API/DuckDuckGoAPI.ts` — `generateToken(query)` scrapes the `vqd`
  token from `duckduckgo.com/?...` HTML via `TOKEN_REGEX = /vqd=(?<vqd>[\d-]+)/`;
  `imageSearch(query, token, options?)` GETs `duckduckgo.com/i.js?...` and returns the raw
  JSON string. Exports `DDGSearchOptions` + `DDGTime/DDGSize/DDGColor/DDGType/DDGLayout/
  DDGLicense` union types.
- `src/ImageSearch/Engines/DuckDuckGoImageSearchEngine.ts` — runs a prioritized
  multi-query strategy (`SEARCH_OPTIONS`: Large+Square first, widening to any size),
  parses each response, merges/dedups by `imageUrl`, caps at 100 results.
  `PrioritizedSearchOption` / `PrioritizedResult` / `DDGResponse` / `DDGResult` are
  internal `interface`s (were classes; converted to satisfy `max-classes-per-file: 1`).
- `src/ImageSearch/Types/ImageSearchResult.ts` — `{ thumbnailUrl, imageUrl }`.
- `src/ImageSearch/Types/IImageSearchEngine.ts` — `search(query): Promise<ImageSearchResult[]>`.

`node-http-toolkit` public API (from its README / `dist/index.d.mts`): `AsyncResolvingHttpRequest`
(preferred, promise-based, redirects+status), `ResolvingHttpRequest`, `HttpRequest` (raw,
no status inspection), `HttpDownload`, `MultiStreamHttpDownload`, `HttpDownloadProgress`,
`HttpResponseReader`, `HttpResponseSize`, `HttpError` (has `statusCode`/`statusMessage`),
`TimeoutError`, `HttpHeaderUtil`, `HttpFormatter`, `HttpMethod`, `HttpProtocol`,
`HttpStatusCode`. Request signature: `new AsyncResolvingHttpRequest(url, method, headers?,
postData?)` then `.resolve()` -> `http.IncomingMessage`.

## Next Steps

These are known-and-expected remaining items. The user explicitly said they are aware and
will fix them — do NOT redo them unasked.

1. **Dual ESM/CJS build.** Current build is plain `tsc` emitting ESM only.
   `package.json` has `"type": "module"`, `main: dist/index.js`, no `exports` map — a
   `require()` from a CJS consumer fails. `node-http-toolkit` solves this with **tsdown**
   (dual `.mjs`/`.cjs` + `exports` map, `types` field). Replicating that here is the clean
   fix: add tsdown dev dep, rewrite the `build` script, add an `exports` map. Needs
   `npm install`.
2. **Live network validation.** Compile + runtime-load verified, but no real request was
   made to DuckDuckGo. DDG's `vqd` token + `i.js` endpoints are brittle and change; a real
   `search('...')` call should be run to confirm end-to-end wiring still works against
   live DDG.

Open decisions / things to consider:
- The prioritized `SEARCH_OPTIONS` still carry an artwork bias (Large/Square preferred).
  Fine as a default, but a generic image library might expose options to the caller.

## Important Context

- **tsconfig requires `.ts` extensions on relative imports.** `module: nodenext` +
  `allowImportingTsExtensions` + `rewriteRelativeImportExtensions`. Source imports MUST be
  written with `.ts` (e.g. `from '../API/DuckDuckGoAPI.ts'`); tsc rewrites them to `.js` on
  emit. Extensionless relative imports are a compile error. The original copied code had
  extensionless imports — that was part of "make it compile".
- **`verbatimModuleSyntax: true`** — type-only imports/exports must be marked `import type`
  / `export type` / `{ type X }`. E.g. `DDGSearchOptions`, `IImageSearchEngine` are
  type-only.
- **`noUncheckedIndexedAccess: true`** — array index access yields `T | undefined`; guard
  before use (the engine does `if (result == null) continue;`).
- **eslint rules that bit us:** `max-classes-per-file: 1` (helper classes became
  interfaces) and `no-useless-escape` (regex `[\d\-]` -> `[\d-]`).
- **Prettier:** tabs, single quotes, semicolons, trailing-comma all, printWidth 100.
  Run `npx prettier --write src` after edits.
- Only dependency is `node-http-toolkit`. `ts-bakery` and all `AppCore/*`,
  `Library/*`, `Artwork/*`, `ImageMetadataParser/*` references were from the old app and
  are gone.
- User's global workflow rule: run `/documentation:check-documentation-index` before any
  task involving this project's code. Project docs live in `.claude/documentation/`
  (currently just `code-style.md`: explicit access modifiers on all members, const-object
  enums over TS enums, concise class comments).
- Verify commands: `node_modules/.bin/tsc`, `node_modules/.bin/eslint .`,
  `node_modules/.bin/prettier --check src`. Not a git repo.