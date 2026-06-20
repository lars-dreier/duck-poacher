---
title: "Project Overview"
description: "What ddg-search is, its technology stack, how to install it, the public API surface, a runnable usage example, and the project layout."
category: "overview"
tags: ["overview", "getting-started", "public-api", "usage", "stack"]
last_updated: "2026-06-20T09:58:00Z"
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

The public entry point is **`DdgClient`**, the client. Call `imageSearch(query, options?)`
and it returns **parsed `ImageSearchResult[]`** — the client internally generates a
per-session `vqd` token, GETs DuckDuckGo's `i.js` endpoint, and hands the JSON body
to an internal `ImageSearchParser`, so you get result objects, not a raw string.
`ImageSearchResult` is the value object each result comes back as (`{ thumbnailUrl, imageUrl }`).

The library orchestrates token generation for you: a single `imageSearch` call
generates the token and runs the search without any caller involvement. There is no
built-in multi-query, dedupe, or cap — each call to `imageSearch` makes two live HTTP
requests (mint the token, then search) and returns DDG's results for one option set.

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
| `DdgClient` | class | The client: `imageSearch(query, options?)`, token managed internally |
| `ImageSearchResult` | class | Value object: `{ thumbnailUrl, imageUrl }` |
| `DdgSearchOptions` | type | Filter options for `DdgClient.imageSearch` |
| `DdgTime` `DdgSize` `DdgColor` `DdgType` `DdgLayout` `DdgLicense` | type | String-union option values |

`DdgClient` and `ImageSearchResult` are runtime values; the rest are
type-only exports (`export type`). The `ImageSearchClient` and `ImageSearchParser` are
**not** in the barrel — they exist in `src/image/` as internal details that
`DdgClient` delegates to. Callers receive the output of the parser directly
from `imageSearch`.

## Usage

Construct a `DdgClient` and call `imageSearch` — token generation is handled
internally, and the result is already parsed:

```ts
import { DdgClient, type DdgSearchOptions, type ImageSearchResult } from 'ddg-search';

const ddg = new DdgClient();

const options: DdgSearchOptions = {
  size: 'Large',
  layout: 'Square',
  safeSearch: true
};
const results: ImageSearchResult[] = await ddg.imageSearch('mountain landscape', options);

for (const result of results) {
  console.log(result.imageUrl, result.thumbnailUrl);
}
```

Each call makes two live HTTP requests (mint the token, then search). The
`imageSearch` method throws `Error('Unable to read token from DuckDuckGo response.')`
if the `vqd` token cannot be parsed. Network or HTTP failures reject from the
underlying request, and a malformed response body throws out of the parser. See
[architecture.md](architecture.md#error-handling).

## Project Structure

```
src/
  index.ts                          public barrel (re-exports only)
  DdgClient.ts                      the client wrapper
  image/
    ImageSearchClient.ts            HTTP layer + token generation + Ddg* option types
    ImageSearchParser.ts            parses one DDG JSON body (internal)
    ImageSearchResult.ts            { thumbnailUrl, imageUrl } value object
test/                               mirrors src/ (see testing.md)
dist/                               generated by tsdown (gitignored, published)
```

The directory layout maps onto the architecture: `DdgClient.ts` is the thin
public-facing wrapper at the root, which delegates to `ImageSearchClient` in the
`image/` subfolder. `ImageSearchClient` handles HTTP and token generation, while
`ImageSearchParser` parses the response. See [architecture.md](architecture.md) for
how they fit together.

## Commands at a Glance

| Command | Does |
|---------|------|
| `npm run build` | tsdown → dual ESM/CJS in `dist/` |
| `npm test` | run all `test/**/*.test.ts` (hits the live DuckDuckGo API) |
| `npm run typecheck` | `tsc --noEmit` over `src/` |
| `npm run lint` / `lint:fix` | ESLint |
| `npm run format` / `format:check` | dprint |
| `npm run check:exports` | `attw` validates the published export map |

Full detail and the publish flow live in
[development.md](development.md); the testing model is in
[testing.md](testing.md).
