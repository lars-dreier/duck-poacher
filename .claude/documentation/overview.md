---
title: "Project Overview"
description: "What duck-poacher is, its technology stack, the public API surface (image search, image search sessions, web search), runnable usage examples, and the project layout."
category: "overview"
tags: ["overview", "getting-started", "public-api", "usage", "stack"]
last_updated: "2026-11-12T18:03:30Z"
related_docs: ["architecture.md", "ddg-protocol.md", "development.md", "testing.md", "code-style.md"]
---

# Project Overview

## Table of Contents
1. [What It Is](#what-it-is)
2. [Technology Stack](#technology-stack)
3. [Public API](#public-api)
4. [Usage](#usage)
5. [Project Structure](#project-structure)

---

## What It Is

`duck-poacher` is a small Node.js library that scrapes **DuckDuckGo's undocumented
search endpoints**. It offers two capabilities: **image search** (returns image +
thumbnail URLs) and **web search** (returns title + URL + description).

The public entry point is **`DuckDuckGo`**, the client. `imageSearch(query, options?)` and
`webSearch(query, options?)` return parsed result objects. Each call makes two live HTTP
requests: it mints a per-request token (a `vqd` for image search, a signed `d.js` URL for
web search), then runs the search. `createImageSearchSession(query)` mints the `vqd` once
and returns an `ImageSearchSession` whose `search(options?)` reuses it, so repeated image
searches for one query (any filters or safe search level) cost one request each.

Because it scrapes endpoints DuckDuckGo does not document or guarantee, the library is
brittle: DDG can change the token format, the response shape, or the accepted headers at
any time. The protocol is in [ddg-protocol.md](ddg-protocol.md); where the package depends
on it is in [architecture.md](architecture.md#duckduckgo-protocol-quirks).

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
| Tests | built-in `node:test` runner via `tsx` |
| Runtime dependency | `node-http-toolkit` (HTTP layer) |

## Public API

Everything is re-exported from the `src/index.ts` barrel. Nothing else is public.

| Export | Kind | Purpose |
|--------|------|---------|
| `DuckDuckGo` | class | The client: `imageSearch(query, options?: DdgImageSearchOptions)`, `webSearch(query, options?: DdgSearchOptions)`, and `createImageSearchSession(query): Promise<ImageSearchSession>`; tokens managed internally |
| `ImageSearchSession` | type | One image query with its reused `vqd`: `query` plus `search(options?: DdgImageSearchOptions)`. Exported as a type only; obtain it from `createImageSearchSession` |
| `BotChallengeError` | class | `Error` thrown by `imageSearch` and `ImageSearchSession.search` when DDG answers with a bot challenge or an HTTP 403; carries `reason` (DDG's category, `unknown`, or `forbidden` for a 403) |
| `ImageSearchResult` | class | Value object: `{ thumbnailUrl, imageUrl }` |
| `WebSearchResult` | class | Value object: `{ title, url, description }` |
| `DdgSearchOptions` | type | Options shared by every search; the `webSearch` options |
| `DdgImageSearchOptions` | type | `DdgSearchOptions` plus the image filters; the `imageSearch` and `ImageSearchSession.search` options |
| `DdgSafeSearch` | type | String-union value of `safeSearch` |
| `DdgTime` `DdgSize` `DdgColor` `DdgType` `DdgLayout` `DdgLicense` | type | String-union values of the image filters |

### Search Options

All fields are optional. `safeSearch` applies to both searches (`DdgSearchOptions`); the
rest are image filters (`DdgImageSearchOptions`).

| Option | Type | Values |
|--------|------|--------|
| `safeSearch` | `DdgSafeSearch` | `Off` `Moderate` `Strict` (`Moderate`, DDG's default, when omitted) |
| `time` | `DdgTime` | `Day` `Week` `Month` |
| `size` | `DdgSize` | `Small` `Medium` `Large` `Wallpaper` |
| `color` | `DdgColor` | `color` `Monochrome` |
| `type` | `DdgType` | `photo` `clipart` `gif` `transparent` `line` |
| `layout` | `DdgLayout` | `Square` `Tall` `Wide` |
| `license` | `DdgLicense` | `Any` `Public` |

## Usage

### Image Search

```ts
import { DuckDuckGo, type DdgImageSearchOptions, type ImageSearchResult } from 'duck-poacher';

const ddg = new DuckDuckGo();

const options: DdgImageSearchOptions = {
  size: 'Large',
  layout: 'Square',
  safeSearch: 'Strict'
};
const results: ImageSearchResult[] = await ddg.imageSearch('mountain landscape', options);

for (const result of results) {
  console.log(result.imageUrl, result.thumbnailUrl);
}
```

### Image Search Session

```ts
import { DuckDuckGo, type ImageSearchResult, type ImageSearchSession } from 'duck-poacher';

const ddg = new DuckDuckGo();

const session: ImageSearchSession = await ddg.createImageSearchSession('mountain landscape');

const large: ImageSearchResult[] = await session.search({ size: 'Large' });
const strictGifs: ImageSearchResult[] = await session.search({ type: 'gif', safeSearch: 'Strict' });
```

### Web Search

```ts
import { DuckDuckGo, type WebSearchResult } from 'duck-poacher';

const ddg = new DuckDuckGo();

const results: WebSearchResult[] = await ddg.webSearch('Node.js best practices', { safeSearch: 'Strict' });

for (const result of results) {
  console.log(result.title, result.url, result.description);
}
```

All methods reject on token-scrape, HTTP, or response-parse failures, and image searches (`imageSearch`,
`ImageSearchSession.search`) also throw `BotChallengeError`; see [architecture.md](architecture.md#error-handling).

## Project Structure

```
src/
  index.ts                          public barrel (re-exports only)
  DuckDuckGo.ts                     the client wrapper (image + web search, image search sessions)
  common/
    BotChallengeError.ts            error for a DDG bot challenge
    DdgHttpClient.ts                GET requests with shared options applied (internal)
    DdgSearchOptions.ts             DdgSearchOptions + DdgSafeSearch types
    GlobalSearchOptions.ts          turns shared options into headers and URL values (internal)
    SafeSearchCookie.ts             DDG's `p` cookie value per non-default safe search level (internal)
    SafeSearchParam.ts              DDG's i.js `p` URL value per safe search level (internal)
  image/
    DdgImageSearchOptions.ts        DdgImageSearchOptions + filter value types
    ImageSearchClient.ts            scrapes the vqd token, queries i.js
    ImageSearchParser.ts            parses one DDG image JSON body (internal)
    ImageSearchResult.ts            { thumbnailUrl, imageUrl } value object
    ImageSearchSession.ts           one query + its vqd, reused by every search (type-only export)
  web/
    WebSearchClient.ts              scrapes the signed d.js URL, queries it
    WebSearchParser.ts              parses the embedded d.js result array (internal)
    WebSearchResult.ts              { title, url, description } value object
test/                               mirrors src/ (see testing.md)
dist/                               generated by tsdown (gitignored, published)
```

How these fit together: [architecture.md](architecture.md). DuckDuckGo protocol: [ddg-protocol.md](ddg-protocol.md).
Commands and publishing: [development.md](development.md); testing model: [testing.md](testing.md).
