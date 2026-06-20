---
title: "Project Overview"
description: "What ddg-search is, its technology stack, how to install it, the public API surface, a runnable usage example, and the project layout."
category: "overview"
tags: ["overview", "getting-started", "public-api", "usage", "stack"]
last_updated: "2026-06-20T09:17:12Z"
related_docs: ["architecture.md", "development.md", "testing.md", "code-style.md"]
---

# Project Overview

## Table of Contents
1. [What It Is](#what-it-is)
2. [Technology Stack](#technology-stack)
3. [Install](#install)
4. [Public API](#public-api)
5. [Usage](#usage)
6. [Project Structure](#project-structure)
7. [Commands at a Glance](#commands-at-a-glance)

---

## What It Is

`ddg-search` is a small Node.js library that scrapes **DuckDuckGo's
undocumented image-search endpoints** and returns image + thumbnail URLs. It has
no UI, no CLI, and no server — it is a library consumed by other code.

The public entry point is **`DuckDuckGoApi`**, the client:
`generateToken(query)` then `imageSearch(query, token, options?)` returns
**parsed `ImageSearchResult[]`** — the client GETs DuckDuckGo's `i.js` endpoint
and hands the JSON body to an internal `ImageSearchParser`, so you get result
objects, not a raw string. `ImageSearchResult` is the value object each result
comes back as (`{ thumbnailUrl, imageUrl }`).

The library does **not** orchestrate token generation for you: a caller
generates a token once and passes it to each `imageSearch` call. There is also no
built-in prioritized multi-query, dedupe, or cap — `imageSearch` is a single
request that returns DDG's results for one option set. (An earlier
`DuckDuckGoImageSearch` engine that did all of that was removed; see
[architecture.md](architecture.md#client-and-parser).)

Because it scrapes endpoints DuckDuckGo does not document or guarantee, the
library is inherently brittle: DDG can change the token format, the response
shape, or the accepted headers at any time. See
[architecture.md](architecture.md#duckduckgo-protocol-quirks) for the moving
parts.

## Technology Stack

| Concern | Choice |
|---------|--------|
| Language | TypeScript (strict; authored with `.ts` import extensions) |
| Runtime | Node.js `>=18` (build target `node18`) |
| Module system | ESM-first (`"type": "module"`); ships dual ESM + CJS |
| Build | [tsdown](https://tsdown.dev) (`tsdown.config.ts`) |
| Type-check | `tsc --noEmit` |
| Lint | ESLint flat config + `typescript-eslint` (`eslint.config.mjs`) |
| Format | [dprint](https://dprint.dev) (`dprint.json`) |
| Tests | built-in `node:test` runner via `tsx` (no Jest/Vitest/Mocha) |
| Runtime dependency | `node-http-toolkit` (the only one) |

The single runtime dependency, `node-http-toolkit`, provides the HTTP layer:
`AsyncResolvingHttpRequest` (promise-based GET that follows redirects and
rejects on HTTP ≥ 400), `HttpResponseReader` (buffers and decompresses
gzip/deflate/br), and `HttpMethod`.

## Install

```sh
npm install ddg-search
```

Requires Node.js 18 or newer. The package exposes both an ESM `import` and a
CJS `require` entry through its `exports` map.

## Public API

Everything is re-exported from the `src/index.ts` barrel. Nothing else is
public.

| Export | Kind | Purpose |
|--------|------|---------|
| `DuckDuckGoApi` | class | Token generation + parsed image search |
| `ImageSearchResult` | class | Value object: `{ thumbnailUrl, imageUrl }` |
| `DdgSearchOptions` | type | Filter options for `DuckDuckGoApi.imageSearch` |
| `DdgTime` `DdgSize` `DdgColor` `DdgType` `DdgLayout` `DdgLicense` | type | String-union option values |

`DuckDuckGoApi` and `ImageSearchResult` are runtime values; the rest are
type-only exports (`export type`). The `ImageSearchParser` is **not** in the
barrel — it exists in `src/image/` as an internal detail `DuckDuckGoApi`
delegates to, and callers receive its output directly from `imageSearch`.

## Usage

Generate a token once, then search — the result is already parsed:

```ts
import { DuckDuckGoApi, type DdgSearchOptions, type ImageSearchResult } from 'ddg-search';

const api = new DuckDuckGoApi();
const token = await api.generateToken('mountain landscape');

const options: DdgSearchOptions = {
  size: 'Large',
  layout: 'Square',
  safeSearch: true
};
const results: ImageSearchResult[] = await api.imageSearch('mountain landscape', token, options);

for (const result of results) {
  console.log(result.imageUrl, result.thumbnailUrl);
}
```

`generateToken` throws `Error('Unable to read token from DuckDuckGo response.')`
if the `vqd` token cannot be parsed. Network or HTTP failures reject from the
underlying request, and a malformed response body throws out of the parser. See
[architecture.md](architecture.md#error-handling).

## Project Structure

```
src/
  index.ts                          public barrel (re-exports only)
  DuckDuckGoApi.ts                  the client + Ddg* option types
  image/
    ImageSearchParser.ts            parses one DDG JSON body (internal)
    ImageSearchResult.ts            { thumbnailUrl, imageUrl } value object
test/                               mirrors src/ (see testing.md)
dist/                               generated by tsdown (gitignored, published)
```

The directory layout maps onto the architecture: `DuckDuckGoApi.ts` is the thin
DDG client at the root, and `image/` holds the parser plus the result value
object. See [architecture.md](architecture.md) for how they fit together.

## Commands at a Glance

| Command | Does |
|---------|------|
| `npm run build` | tsdown → dual ESM/CJS in `dist/` |
| `npm test` | run all `test/**/*.test.ts` (the API specs hit the live DDG API) |
| `npm run typecheck` | `tsc --noEmit` over `src/` |
| `npm run lint` / `lint:fix` | ESLint |
| `npm run format` / `format:check` | dprint |
| `npm run check:exports` | `attw` validates the published export map |

Full detail and the publish flow live in
[development.md](development.md); the testing model is in
[testing.md](testing.md).
