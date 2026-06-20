---
title: "Architecture & Internals"
description: "How duck-poacher works inside: the DuckDuckGo facade, ImageSearchClient implementation, the token→search→parse flow, DdgSearchOptions encoding, data models, and DuckDuckGo protocol quirks."
category: "architecture"
tags: ["architecture", "design", "ddg", "search-strategy", "data-flow", "internals"]
last_updated: "2026-06-20T10:21:54Z"
related_docs: ["overview.md", "code-style.md", "testing.md"]
---

# Architecture & Internals

## Table of Contents
1. [Client Layers and Parser](#client-layers-and-parser)
2. [End-to-End Flow](#end-to-end-flow)
3. [The Facade: DuckDuckGo](#the-facade-duckduckgo)
4. [The Implementation: ImageSearchClient](#the-implementation-imagesearchclient)
   - [Token Generation](#token-generation)
   - [Image Search and Option Encoding](#image-search-and-option-encoding)
5. [The Parser: ImageSearchParser](#the-parser-imagesearchparser)
6. [Data Models](#data-models)
7. [DuckDuckGo Protocol Quirks](#duckduckgo-protocol-quirks)
8. [Error Handling](#error-handling)

---

## Client Layers and Parser

The library is organized in two client layers plus a small parser:

| Class | File | Responsibility | Role |
|-------|------|-----------------|------|
| `DuckDuckGo` | `src/DuckDuckGo.ts` | Public entry point; orchestrates token generation and search | Facade |
| `ImageSearchClient` | `src/image/ImageSearchClient.ts` | HTTP communication, token scraping, option encoding, parser ownership | Implementation |
| `ImageSearchParser` | `src/image/ImageSearchParser.ts` | Parse DDG JSON response into result objects | Data transformation |

**DuckDuckGo** is a thin facade that callers import and use. It owns a single private instance of `ImageSearchClient` and delegates all work to it:

```ts
export default class DuckDuckGo {
	private readonly _imageSearch = new ImageSearchClient();

	public async imageSearch(query: string, options?: DdgSearchOptions): Promise<ImageSearchResult[]> {
		const token: string = await this._imageSearch.generateToken(query);
		return this._imageSearch.imageSearch(query, token, options);
	}
}
```

This separation of concerns keeps the public API minimal and clean while the implementation details live in `ImageSearchClient`.

**ImageSearchClient** owns the parser instance (`private readonly _parser = new ImageSearchParser()`) and is its only caller in this package. The parser knows nothing about HTTP, URLs, headers, or tokens; the client knows nothing about the JSON shape beyond delegating to the parser. This keeps the brittle, DDG-specific transport and the response-shape knowledge each in one place, and lets the parser be unit-tested offline with a fixture string ([testing.md](testing.md#test-layout)).

> **Note — removed prioritized engine.** Earlier versions had a higher-level `DuckDuckGoImageSearch` engine that ran the same query four times with progressively looser filters, then ranked, deduped, and capped the merged results at 100. That multi-query strategy was **removed**; the parser is all that remains of that file. A search now mints a token once and runs a single `imageSearch`. If the prioritized strategy is wanted again it is a rebuild, not a re-wire.

## End-to-End Flow

A search drives two HTTP steps, orchestrated by `DuckDuckGo`:

```
DuckDuckGo.imageSearch(query, options?)
  ├─ ImageSearchClient.generateToken(query)  1 HTTP GET → vqd token
  └─ ImageSearchClient.imageSearch(query, token, options?)
      └─ 1 HTTP GET → raw JSON body
         └─ _parser.parse(body)  → ImageSearchResult[]
```

So one `DuckDuckGo.imageSearch` makes two sequential HTTP requests against live DuckDuckGo (mint the token, then search), and its result is already parsed. There is no internal multi-request fan-out, dedupe, or cap — a caller that wants those composes them on top.

## The Facade: DuckDuckGo

`src/DuckDuckGo.ts`. The public entry point, responsible for orchestrating the two-step search process. It exposes a single public method:

```ts
public async imageSearch(query: string, options?: DdgSearchOptions): Promise<ImageSearchResult[]>
```

This method:
1. Calls `this._imageSearch.generateToken(query)` to obtain a session token.
2. Calls `this._imageSearch.imageSearch(query, token, options)` with that token.
3. Returns the parsed results.

Callers import and use `DuckDuckGo`; they never touch `ImageSearchClient` directly.

## The Implementation: ImageSearchClient

`src/image/ImageSearchClient.ts`. A thin, near-stateless client. Its configuration fields are `private readonly` constants (headers, the option-name order, the token regex); the one non-constant field is `private readonly _parser`. It exposes two public methods (`generateToken`, `imageSearch`) and keeps URL construction private.

### Token Generation

DuckDuckGo's image endpoint requires a per-session `vqd` token that is not handed out via an API — it is embedded in the HTML/script of the search page. `generateToken(query)`:

1. Builds `https://duckduckgo.com/?q=<query>&atb=v299-1&iar=images&iax=images&ia=images`.
2. GETs it with `TOKEN_HEADERS` (just `dnt: 1`) via `AsyncResolvingHttpRequest`.
3. Reads the full body with `HttpResponseReader`.
4. Scrapes the token with `TOKEN_REGEX = /vqd=(?<vqd>[\d-]+)/`.
5. Throws if no match; otherwise returns the captured `vqd` string.

The token is a string of digits and dashes (the live test asserts `/^[\d-]+$/`). It must be passed to every subsequent `imageSearch` call (in normal usage, the `DuckDuckGo.imageSearch` facade handles this internally).

### Image Search and Option Encoding

`imageSearch(query, token, options?)` GETs `https://duckduckgo.com/i.js?...` with the richer `SEARCH_HEADERS` (a browser `user-agent`, `x-requested-with: XMLHttpRequest`, `referer`, etc.), reads the response body with `HttpResponseReader`, and returns `this._parser.parse(responseText)` — an `ImageSearchResult[]`. The JSON parsing itself lives in the parser, not here.

The query parameters built in `createSearchUrl`:

| Param | Value | Meaning |
|-------|-------|---------|
| `l` | `de-de` | locale |
| `o` | `json` | output format |
| `q` | query | search terms |
| `vqd` | token | the scraped token |
| `f` | encoded options | the filter string (below) |
| `p` | `1` or `-1` | safe search on / off |

The `f` parameter is the interesting part. `DdgSearchOptions` is encoded by `createImageSearchOptionsHeader` into a comma-joined string of `name:value` pairs, **in a fixed order** defined by `OPTION_NAMES`:

```ts
private readonly OPTION_NAMES: string[] = ['time', 'size', 'color', 'type', 'layout', 'license'];
```

Each option present becomes `name:value`; each absent option becomes an empty slot. So `{ size: 'Large', layout: 'Square' }` encodes to `,size:Large,,,layout:Square,` — the empty commas are positional placeholders DDG expects. **The order in `OPTION_NAMES` is load-bearing** (the source even comments `// Order is important`); reordering it would mis-map filters.

`safeSearch` is handled separately as the `p` parameter, not part of `f`.

The option value types (all string unions, exported for callers):

| Type | Values |
|------|--------|
| `DdgTime` | `Day` `Week` `Month` |
| `DdgSize` | `Small` `Medium` `Large` `Wallpaper` |
| `DdgColor` | `color` `Monochrome` |
| `DdgType` | `photo` `clipart` `gif` `transparent` `line` |
| `DdgLayout` | `Square` `Tall` `Wide` |
| `DdgLicense` | `Any` `Public` |

## The Parser: ImageSearchParser

`src/image/ImageSearchParser.ts`. A single-purpose, dependency-free class (it imports only `ImageSearchResult`). Its one public method:

```ts
public parse(responseText: string): ImageSearchResult[]
```

It `JSON.parse`s the body, casts it to the internal `DdgResponse` shape, and maps each `DdgResult` to `new ImageSearchResult(result.thumbnail, result.image)`. The `DdgResponse` and `DdgResult` shapes are `interface`s in the same file — partly because the project enforces `max-classes-per-file: 1` (see [code-style.md](code-style.md#one-class-per-file)). Because it touches no network, it is the one search-path piece covered by an **offline** unit test ([testing.md](testing.md#live-integration-tests)).

## Data Models

The one public value object lives in `src/image/ImageSearchResult.ts`:

```ts
// src/image/ImageSearchResult.ts — the value object every search returns
class ImageSearchResult {
  constructor(
    public readonly thumbnailUrl: string,
    public readonly imageUrl: string
  ) {}
}
```

`ImageSearchResult` is immutable (both fields `readonly`, set via constructor parameter properties). Note the **constructor argument order is `thumbnailUrl, imageUrl`** but the parser maps from DDG's `{ image, thumbnail }` — `new ImageSearchResult(result.thumbnail, result.image)`. Keep that mapping straight when touching either side.

`src/index.ts` re-exports `DuckDuckGo`, `ImageSearchResult`, and the `Ddg*` types:

```ts
export { default as DuckDuckGo } from './DuckDuckGo.ts';
export type {
	DdgColor,
	DdgLayout,
	DdgLicense,
	DdgSearchOptions,
	DdgSize,
	DdgTime,
	DdgType
} from './image/ImageSearchClient.ts';
export { default as ImageSearchResult } from './image/ImageSearchResult.ts';
```

`ImageSearchParser` and `ImageSearchClient` live in the source tree but are not exported from the barrel (see [overview.md](overview.md#public-api)), since callers receive parsed results from `DuckDuckGo.imageSearch` and never need either directly.

## DuckDuckGo Protocol Quirks

These are the reasons the library is brittle and why the tests hit the live API ([testing.md](testing.md#live-integration-tests)):

- **Undocumented endpoints.** `duckduckgo.com/?...` (token page) and `duckduckgo.com/i.js?...` (image JSON) are not a public, versioned API. DDG can change them without notice.
- **The `vqd` token.** Required, scraped from page HTML with a regex, and its format can drift. A changed format breaks `TOKEN_REGEX`.
- **Header sensitivity.** The image endpoint expects browser-like headers (`user-agent`, `x-requested-with`, `referer`, `accept`). Stripping them can change or block the response.
- **Response shape.** The parser assumes `{ results: [{ image, thumbnail }] }`. If DDG renames or restructures those fields, `parse` produces wrong or empty results — the offline parser test pins the expected mapping, the live test catches shape drift.
- **Transport.** Responses are gzip/deflate/br-compressed and chunked. The `HttpResponseReader` from `node-http-toolkit` handles buffering and decompression; the request goes through `AsyncResolvingHttpRequest`, which follows redirects and rejects on HTTP ≥ 400.

## Error Handling

The package **fails fast** and throws rather than logging or swallowing:

- `generateToken` throws `Error('Unable to read token from DuckDuckGo response.')` when the regex finds no `vqd`.
- HTTP-level failures (status ≥ 400, network errors, timeouts) reject from the underlying `node-http-toolkit` request and propagate out of `generateToken` or `imageSearch`.
- `ImageSearchParser.parse` does not guard its input: a non-JSON body throws from `JSON.parse`, and a response missing `results` throws when it is iterated. Both propagate to the `imageSearch` caller (through `DuckDuckGo`). This is deliberate — a malformed response is a real failure, not something to paper over.
