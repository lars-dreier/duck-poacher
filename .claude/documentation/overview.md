---
title: "Project Overview"
description: "What ddg-search is, its technology stack, how to install it, the public API surface, a runnable usage example, and the project layout."
category: "overview"
tags: ["overview", "getting-started", "public-api", "usage", "stack"]
last_updated: "2026-06-19T23:32:31Z"
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

There are two ways to use it:

- **`DuckDuckGoImageSearchEngine`** — the high-level entry point. Call
  `search(query)` and get back a deduped, prioritized, capped list of
  `ImageSearchResult`. Use this unless you have a reason not to.
- **`DuckDuckGoApi`** — the low-level client. `generateToken(query)` then
  `imageSearch(query, token, options?)` returns the **raw JSON string** from
  DuckDuckGo. Use this when you want direct control over options and parsing.

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
| `DuckDuckGoImageSearchEngine` | class | High-level `search(query) → ImageSearchResult[]` |
| `DuckDuckGoApi` | class | Low-level token + raw-JSON image search |
| `ImageSearchResult` | class | Value object: `{ thumbnailUrl, imageUrl }` |
| `IImageSearchEngine` | type | Interface implemented by the engine |
| `DdgSearchOptions` | type | Filter options for `DuckDuckGoApi.imageSearch` |
| `DdgTime` `DdgSize` `DdgColor` `DdgType` `DdgLayout` `DdgLicense` | type | String-union option values |

`DuckDuckGoImageSearchEngine`, `DuckDuckGoApi`, and `ImageSearchResult` are
runtime values; the rest are type-only exports (`export type`).

## Usage

High-level — let the engine do the work:

```ts
import { DuckDuckGoImageSearchEngine } from 'ddg-search';

const engine = new DuckDuckGoImageSearchEngine();
const results = await engine.search('mountain landscape');

for (const result of results) {
  console.log(result.imageUrl, result.thumbnailUrl);
}
// results: deduped by imageUrl, prioritized (Large/Square first), capped at 100
```

Low-level — drive the API directly when you need specific filters or the raw
response:

```ts
import { DuckDuckGoApi, type DdgSearchOptions } from 'ddg-search';

const api = new DuckDuckGoApi();
const token = await api.generateToken('mountain landscape');

const options: DdgSearchOptions = {
  size: 'Large',
  layout: 'Square',
  safeSearch: true
};
const rawJson = await api.imageSearch('mountain landscape', token, options);
const { results } = JSON.parse(rawJson); // raw DDG shape: { results: [{ image, thumbnail }] }
```

`generateToken` throws `Error('Unable to read token from DuckDuckGo response.')`
if the `vqd` token cannot be parsed. Network or HTTP failures reject from the
underlying request. The engine runs several requests sequentially and
**fails fast** — a single failed sub-search propagates out of `search()`.

## Project Structure

```
src/
  index.ts                                  public barrel (re-exports only)
  image-search/
    api/DuckDuckGoApi.ts                     low-level client + Ddg* option types
    engine/DuckDuckGoImageSearchEngine.ts    high-level prioritized search
    types/IImageSearchEngine.ts              engine interface
    types/ImageSearchResult.ts               { thumbnailUrl, imageUrl } value object
test/                                        mirrors src/ one-to-one (see testing.md)
dist/                                        generated by tsdown (gitignored, published)
```

The directory layout maps directly onto the architecture: `api/` is the thin
DDG client, `engine/` is the strategy layer, `types/` holds the data contracts.
See [architecture.md](architecture.md) for how they fit together.

## Commands at a Glance

| Command | Does |
|---------|------|
| `npm run build` | tsdown → dual ESM/CJS in `dist/` |
| `npm test` | run all `test/**/*.test.ts` (hits the live DDG API) |
| `npm run typecheck` | `tsc --noEmit` over `src/` |
| `npm run lint` / `lint:fix` | ESLint |
| `npm run format` / `format:check` | dprint |
| `npm run check:exports` | `attw` validates the published export map |

Full detail and the publish flow live in
[development.md](development.md); the testing model is in
[testing.md](testing.md).
