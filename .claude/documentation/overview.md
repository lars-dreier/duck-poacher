---
title: "Project Overview"
description: "What duck-poacher is, its technology stack, how to install it, the public API surface (image and web search), runnable usage examples, and the project layout."
category: "overview"
tags: ["overview", "getting-started", "public-api", "usage", "stack"]
last_updated: "2026-06-21T10:00:32Z"
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

`duck-poacher` is a small Node.js library that scrapes **DuckDuckGo's undocumented
search endpoints**. It offers two capabilities: **image search** (returns image +
thumbnail URLs) and **web search** (returns title + URL + description). It has no UI,
no CLI, and no server — it is a library consumed by other code.

The public entry point is **`DuckDuckGo`**, the client. Call `imageSearch(query, options?)`
or `webSearch(query)` and you get back **parsed result objects**, not raw strings — the
client internally mints a per-session token (a `vqd` for image search, a signed `d.js`
URL for web search), fetches the endpoint, and hands the body to an internal parser.

The library orchestrates token generation for you: each call generates the token and
runs the search without any caller involvement. There is no built-in multi-query,
dedupe, or cap — each call makes two live HTTP requests (mint the token, then search)
and returns DDG's results for that query.

Because it scrapes endpoints DuckDuckGo does not document or guarantee, the library is
inherently brittle: DDG can change the token format, the response shape, or the accepted
headers at any time. See [architecture.md](architecture.md#duckduckgo-protocol-quirks)
for the moving parts.

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
`AsyncResolvingHttpRequest` (promise-based GET that follows redirects and rejects on
HTTP ≥ 400), `HttpResponseReader` (buffers and decompresses gzip/deflate/br), and
`HttpMethod`.

## Install

```sh
npm install duck-poacher
```

Requires Node.js 18 or newer. The package exposes both an ESM `import` and a CJS
`require` entry through its `exports` map.

## Public API

Everything is re-exported from the `src/index.ts` barrel. Nothing else is public.

| Export | Kind | Purpose |
|--------|------|---------|
| `DuckDuckGo` | class | The client: `imageSearch(query, options?)` and `webSearch(query)`, token managed internally |
| `ImageSearchResult` | class | Value object: `{ thumbnailUrl, imageUrl }` |
| `WebSearchResult` | class | Value object: `{ title, url, description }` |
| `DdgSearchOptions` | type | Filter options for `DuckDuckGo.imageSearch` (image search only) |
| `DdgTime` `DdgSize` `DdgColor` `DdgType` `DdgLayout` `DdgLicense` | type | String-union option values |

`DuckDuckGo`, `ImageSearchResult`, and `WebSearchResult` are runtime values; the rest
are type-only exports (`export type`). The `ImageSearchClient`, `WebSearchClient`, and
the two parsers are **not** in the barrel — they exist under `src/image/` and `src/web/`
as internal details that `DuckDuckGo` delegates to. Web search exposes no filter options
(DuckDuckGo's web endpoint does not accept them).

### `DdgSearchOptions` (image search only)

All fields are optional. `safeSearch` is a `boolean`; the rest are string unions:

| Option | Type | Values |
|--------|------|--------|
| `time` | `DdgTime` | `Day` `Week` `Month` |
| `size` | `DdgSize` | `Small` `Medium` `Large` `Wallpaper` |
| `color` | `DdgColor` | `color` `Monochrome` |
| `type` | `DdgType` | `photo` `clipart` `gif` `transparent` `line` |
| `layout` | `DdgLayout` | `Square` `Tall` `Wide` |
| `license` | `DdgLicense` | `Any` `Public` |
| `safeSearch` | `boolean` | safe search on / off |

## Usage

### Image Search

```ts
import { DuckDuckGo, type DdgSearchOptions, type ImageSearchResult } from 'duck-poacher';

const ddg = new DuckDuckGo();

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

### Web Search

```ts
import { DuckDuckGo, type WebSearchResult } from 'duck-poacher';

const ddg = new DuckDuckGo();

const results: WebSearchResult[] = await ddg.webSearch('Node.js best practices');

for (const result of results) {
  console.log(result.title, result.url, result.description);
}
```

Each call makes two live HTTP requests (mint the token, then search). `imageSearch`
throws `Error('Unable to read token from DuckDuckGo response.')` if the `vqd` token
cannot be parsed; `webSearch` throws `Error('Unable to read search URL from DuckDuckGo
response.')` if the signed search URL cannot be scraped. Network or HTTP failures reject
from the underlying request, and a malformed response body throws out of the parser. See
[architecture.md](architecture.md#error-handling).

## Project Structure

```
src/
  index.ts                          public barrel (re-exports only)
  DuckDuckGo.ts                      the client wrapper (image + web search)
  image/
    ImageSearchClient.ts            HTTP layer + token generation + Ddg* option types
    ImageSearchParser.ts            parses one DDG image JSON body (internal)
    ImageSearchResult.ts            { thumbnailUrl, imageUrl } value object
  web/
    WebSearchClient.ts              HTTP layer + signed-URL generation
    WebSearchParser.ts              parses the embedded d.js result array (internal)
    WebSearchResult.ts              { title, url, description } value object
test/                               mirrors src/ (see testing.md)
dist/                               generated by tsdown (gitignored, published)
```

The directory layout maps onto the architecture: `DuckDuckGo.ts` is the thin
public-facing wrapper at the root, which delegates to `ImageSearchClient` (`image/`) and
`WebSearchClient` (`web/`). Each client handles HTTP and token generation; its sibling
parser turns the response into result objects. See [architecture.md](architecture.md)
for how they fit together.

## Commands at a Glance

| Command | Does |
|---------|------|
| `npm run build` | tsdown → dual ESM/CJS in `dist/` |
| `npm test` | run all `test/**/*.test.ts` (hits the live DuckDuckGo API) |
| `npm run typecheck` | `tsc --noEmit` over `src/` |
| `npm run lint` / `lint:fix` | ESLint |
| `npm run format` / `format:check` | dprint |
| `npm run check:exports` | `attw` validates the published export map |

Full detail and the publish flow live in [development.md](development.md); the testing
model is in [testing.md](testing.md).
