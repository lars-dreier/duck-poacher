---
title: "Architecture & Internals"
description: "How ddg-search works inside: the DuckDuckGoApi client plus the ImageSearchParser, the token→search→parse flow, the DdgSearchOptions encoding, the data models, and the DuckDuckGo protocol quirks."
category: "architecture"
tags: ["architecture", "design", "ddg", "search-strategy", "data-flow", "internals"]
last_updated: "2026-06-20T09:17:12Z"
related_docs: ["overview.md", "code-style.md", "testing.md"]
---

# Architecture & Internals

## Table of Contents
1. [Client and Parser](#client-and-parser)
2. [End-to-End Flow](#end-to-end-flow)
3. [The Client: DuckDuckGoApi](#the-client-duckduckgoapi)
   - [Token Generation](#token-generation)
   - [Image Search and Option Encoding](#image-search-and-option-encoding)
4. [The Parser: ImageSearchParser](#the-parser-imagesearchparser)
5. [Data Models](#data-models)
6. [DuckDuckGo Protocol Quirks](#duckduckgo-protocol-quirks)
7. [Error Handling](#error-handling)

---

## Client and Parser

The library is one public client class plus a small parser it delegates to:

| Class | Responsibility | Returns |
|-------|----------------|---------|
| `DuckDuckGoApi` | Talk to DDG: get a token, GET `i.js`, encode options, hand the body to the parser | `ImageSearchResult[]` |
| `ImageSearchParser` | Turn one DDG JSON response body into result objects | `ImageSearchResult[]` |

`DuckDuckGoApi` **owns an instance of the parser** (`private readonly _parser =
new ImageSearchParser()`) and is its only caller in this package. The parser
knows nothing about HTTP, URLs, headers, or tokens; the client knows nothing
about the JSON shape beyond delegating to the parser. This keeps the brittle,
DDG-specific transport and the response-shape knowledge each in one place, and
lets the parser be unit-tested offline with a fixture string
([testing.md](testing.md#test-layout)).

> **Note — removed prioritized engine.** Earlier versions had a higher-level
> `DuckDuckGoImageSearch` engine that ran the same query four times with
> progressively looser filters, then ranked, deduped, and capped the merged
> results at 100. That multi-query strategy and its automatic token+search
> orchestration were **removed**; the parser is all that remains of that file.
> A caller now generates a token once and calls `imageSearch` directly. If the
> prioritized strategy is wanted again it is a rebuild, not a re-wire.

## End-to-End Flow

A search is now two explicit steps the caller drives:

```
generateToken(query)                 1 HTTP GET → vqd token
imageSearch(query, token, options?)  1 HTTP GET → raw JSON body
  └─ _parser.parse(body)             → ImageSearchResult[]
```

So one `imageSearch` is a **single** HTTP request against live DuckDuckGo, and
its result is already parsed. There is no longer any internal multi-request fan-out,
dedupe, or cap — a caller that wants those composes them on top.

## The Client: DuckDuckGoApi

`src/DuckDuckGoApi.ts`. A thin, near-stateless client. Its configuration fields
are `private readonly` constants (headers, the option-name order, the token
regex); the one non-constant field is `private readonly _parser`. It exposes two
public methods (`generateToken`, `imageSearch`) and keeps URL construction
private.

### Token Generation

DuckDuckGo's image endpoint requires a per-session `vqd` token that is not
handed out via an API — it is embedded in the HTML/script of the search page.
`generateToken(query)`:

1. Builds `https://duckduckgo.com/?q=<query>&atb=v299-1&iar=images&iax=images&ia=images`.
2. GETs it with `TOKEN_HEADERS` (just `dnt: 1`) via `AsyncResolvingHttpRequest`.
3. Reads the full body with `HttpResponseReader`.
4. Scrapes the token with `TOKEN_REGEX = /vqd=(?<vqd>[\d-]+)/`.
5. Throws if no match; otherwise returns the captured `vqd` string.

The token is a string of digits and dashes (the live test asserts
`/^[\d-]+$/`). It must be passed to every subsequent `imageSearch` call.

### Image Search and Option Encoding

`imageSearch(query, token, options?)` GETs
`https://duckduckgo.com/i.js?...` with the richer `SEARCH_HEADERS` (a browser
`user-agent`, `x-requested-with: XMLHttpRequest`, `referer`, etc.), reads the
response body with `HttpResponseReader`, and returns
`this._parser.parse(responseText)` — an `ImageSearchResult[]`. The JSON parsing
itself lives in the parser, not here.

The query parameters built in `createSearchUrl`:

| Param | Value | Meaning |
|-------|-------|---------|
| `l` | `de-de` | locale |
| `o` | `json` | output format |
| `q` | query | search terms |
| `vqd` | token | the scraped token |
| `f` | encoded options | the filter string (below) |
| `p` | `1` or `-1` | safe search on / off |

The `f` parameter is the interesting part. `DdgSearchOptions` is encoded by
`createImageSearchOptionsHeader` into a comma-joined string of `name:value`
pairs, **in a fixed order** defined by `OPTION_NAMES`:

```ts
private readonly OPTION_NAMES: string[] = ['time', 'size', 'color', 'type', 'layout', 'license'];
```

Each option present becomes `name:value`; each absent option becomes an empty
slot. So `{ size: 'Large', layout: 'Square' }` encodes to
`,size:Large,,,layout:Square,` — the empty commas are positional placeholders
DDG expects. **The order in `OPTION_NAMES` is load-bearing** (the source even
comments `// Order is important`); reordering it would mis-map filters.

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

`src/image/ImageSearchParser.ts`. A single-purpose, dependency-free class
(it imports only `ImageSearchResult`). Its one public method:

```ts
public parse(responseText: string): ImageSearchResult[]
```

It `JSON.parse`s the body, casts it to the internal `DdgResponse` shape, and maps
each `DdgResult` to `new ImageSearchResult(result.thumbnail, result.image)`. The
`DdgResponse` and `DdgResult` shapes are `interface`s in the same file — partly
because the project enforces `max-classes-per-file: 1` (see
[code-style.md](code-style.md#one-class-per-file)). Because it touches no network,
it is the one search-path piece covered by an **offline** unit test
([testing.md](testing.md#live-integration-tests)).

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

`ImageSearchResult` is immutable (both fields `readonly`, set via constructor
parameter properties). Note the **constructor argument order is
`thumbnailUrl, imageUrl`** but the parser maps from DDG's `{ image, thumbnail }`
— `new ImageSearchResult(result.thumbnail, result.image)`. Keep that mapping
straight when touching either side.

`src/index.ts` re-exports `DuckDuckGoApi`, `ImageSearchResult`, and the `Ddg*`
types — `ImageSearchParser` lives in the source tree but is not exported from the
barrel (see [overview.md](overview.md#public-api)), since callers receive parsed
results from `imageSearch` and never need the parser directly.

## DuckDuckGo Protocol Quirks

These are the reasons the library is brittle and why the tests hit the live API
([testing.md](testing.md#live-integration-tests)):

- **Undocumented endpoints.** `duckduckgo.com/?...` (token page) and
  `duckduckgo.com/i.js?...` (image JSON) are not a public, versioned API. DDG
  can change them without notice.
- **The `vqd` token.** Required, scraped from page HTML with a regex, and its
  format can drift. A changed format breaks `TOKEN_REGEX`.
- **Header sensitivity.** The image endpoint expects browser-like headers
  (`user-agent`, `x-requested-with`, `referer`, `accept`). Stripping them can
  change or block the response.
- **Response shape.** The parser assumes `{ results: [{ image, thumbnail }] }`.
  If DDG renames or restructures those fields, `parse` produces wrong or empty
  results — the offline parser test pins the expected mapping, the live test
  catches shape drift.
- **Transport.** Responses are gzip/deflate/br-compressed and chunked. The
  `HttpResponseReader` from `node-http-toolkit` handles buffering and
  decompression; the request goes through `AsyncResolvingHttpRequest`, which
  follows redirects and rejects on HTTP ≥ 400.

## Error Handling

The package **fails fast** and throws rather than logging or swallowing:

- `generateToken` throws `Error('Unable to read token from DuckDuckGo
  response.')` when the regex finds no `vqd`.
- HTTP-level failures (status ≥ 400, network errors, timeouts) reject from the
  underlying `node-http-toolkit` request and propagate out of `generateToken` or
  `imageSearch`.
- `ImageSearchParser.parse` does not guard its input: a non-JSON body throws from
  `JSON.parse`, and a response missing `results` throws when it is iterated. Both
  propagate to the `imageSearch` caller. This is deliberate — a malformed
  response is a real failure, not something to paper over.
