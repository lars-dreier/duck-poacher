---
title: "Architecture & Internals"
description: "How duck-poacher works inside: the DuckDuckGo composition root, ImageSearchClient and WebSearchClient, the token→search→parse flow, image filter encoding, safe search handling, parsers, bot-challenge detection, DuckDuckGo protocol quirks and error handling."
category: "architecture"
tags: ["architecture", "design", "ddg", "search-strategy", "data-flow", "internals", "safe-search", "bot-challenge"]
last_updated: "2026-11-08T21:10:46Z"
related_docs: ["overview.md", "code-style.md", "testing.md"]
---

# Architecture & Internals

## Table of Contents

1. [Client Layers and Parsers](#client-layers-and-parsers)
2. [End-to-End Flow](#end-to-end-flow)
3. [The Facade: DuckDuckGo](#the-facade-duckduckgo)
4. [Image Search: ImageSearchClient](#image-search-imagesearchclient)
5. [Web Search: WebSearchClient](#web-search-websearchclient)
6. [Safe Search](#safe-search)
7. [Parsers](#parsers)
8. [Data Models](#data-models)
9. [DuckDuckGo Protocol Quirks](#duckduckgo-protocol-quirks)
10. [Error Handling](#error-handling)
11. [Exports](#exports)

---

## Client Layers and Parsers

Image and web search each have their own client, parser and result class, because DuckDuckGo's two endpoints authenticate and respond differently.

- **Facade**: `src/DuckDuckGo.ts` hides the two-step token and search sequence and is the composition root.
- **Client**: `src/image/ImageSearchClient.ts`, `src/web/WebSearchClient.ts` own HTTP, token generation and URL construction.
- **Parser**: `src/image/ImageSearchParser.ts`, `src/web/WebSearchParser.ts` extract results from DDG's response formats.
- **Result**: `src/image/ImageSearchResult.ts`, `src/web/WebSearchResult.ts` are immutable value objects.
- **Shared**: `src/common/` holds `DdgSearchOptions.ts` (shared option types), `GlobalSearchOptions` (header application), `SafeSearchParam` (DDG's level values) and `BotChallengeError`.

Each client receives its parser as the constructor parameter `_parser`. `DuckDuckGo` builds the graph in its field initializers: `new ImageSearchClient(new ImageSearchParser())` and `new WebSearchClient(new WebSearchParser())`. Rules are in [code-style.md](code-style.md#dependency-injection).

## End-to-End Flow

### Image Search Flow

```
DuckDuckGo.imageSearch(query, options?)
  ↓
ImageSearchClient.generateToken(query, options)
  ↓ (GET duckduckgo.com with safe search cookie, scrape vqd)
ImageSearchClient.imageSearch(query, token, options)
  ↓ (GET duckduckgo.com/i.js with f and p params and safe search cookie)
ImageSearchParser.parse(responseText)
  ↓ (JSON body; throws BotChallengeError on a challenge)
Promise<ImageSearchResult[]>
```

### Web Search Flow

```
DuckDuckGo.webSearch(query, options?)
  ↓
WebSearchClient.generateToken(query, options)
  ↓ (GET duckduckgo.com with safe search cookie, scrape signed d.js URL)
WebSearchClient.webSearch(query, searchUrl, options)
  ↓ (GET links.duckduckgo.com/d.js?... with safe search cookie)
WebSearchParser.parse(responseText)
  ↓ (extract array from DDG.pageLayout.load('d', [...]))
Promise<WebSearchResult[]>
```

## The Facade: DuckDuckGo

```typescript
public async imageSearch(query: string, options?: DdgImageSearchOptions): Promise<ImageSearchResult[]>
public async webSearch(query: string, options?: DdgSearchOptions): Promise<WebSearchResult[]>
```

Stateless across calls. Each search makes two live HTTP requests, minting a fresh token first, and passes `options` to both steps. Token generation stays internal to the library.

## Image Search: ImageSearchClient

`generateToken(query, options?: DdgSearchOptions): Promise<string>`

1. GETs `https://duckduckgo.com/?q=...&atb=v299-1&iar=images&iax=images&ia=images` with `TOKEN_HEADERS` (`dnt: 1`) plus any safe search cookie.
2. Extracts the token with `TOKEN_REGEX`, `/vqd=(?<vqd>[\d-]+)/`.

`imageSearch(query, token, options?: DdgImageSearchOptions): Promise<ImageSearchResult[]>`

GETs `https://duckduckgo.com/i.js` with `SEARCH_HEADERS` plus any safe search cookie, and hands the body to `_parser.parse`. URL parameters, built in `createSearchUrl`:

- `l`: `de-de` (hardcoded)
- `o`: `json`
- `q`: query
- `vqd`: token
- `f`: positional filter string
- `p`: safe search level ([Safe Search](#safe-search))

**Filter encoding (`createImageSearchOptionsHeader`).** `f` is comma-joined in the fixed order of `OPTION_NAMES` (`time`, `size`, `color`, `type`, `layout`, `license`). A set option contributes `name:value`, an unset one an empty slot. `{ size: 'Large', layout: 'Square' }` encodes to `,size:Large,,,layout:Square,`. The order is load-bearing: reordering `OPTION_NAMES` mis-maps filters. `safeSearch` is not part of `f`.

Option types and values are listed in [overview.md](overview.md#public-api).

## Web Search: WebSearchClient

`generateToken(query, options?: DdgSearchOptions): Promise<string>`

1. GETs `https://duckduckgo.com/?q=...&ia=web&t=h_` with `TOKEN_HEADERS` (`dnt: 1`) plus any safe search cookie.
2. Extracts the full URL with `SEARCH_URL_REGEX`, `/https:\/\/links\.duckduckgo\.com\/d\.js\?[^"']+/`, and returns it.

The "token" is a complete, ready-to-fetch URL, not a bare value. It carries a signed `dp` parameter that only DuckDuckGo's page JavaScript can mint, so the scraped URL must be used as is.

`webSearch(query, searchUrl, options?: DdgSearchOptions): Promise<WebSearchResult[]>`

GETs `searchUrl` with `SEARCH_HEADERS` plus any safe search cookie, and hands the body to `_parser.parse`. `query` is unused: the scraped URL already encodes it.

`SEARCH_HEADERS` imitate Chrome on Windows making a script request, because the browser loads `d.js` through a `<script>` tag: `sec-fetch-dest: script` and no `x-requested-with`. The `sec-ch-ua` versions must track the user-agent. `accept-encoding` omits `zstd` ([Protocol Quirks](#duckduckgo-protocol-quirks)).

## Safe Search

`safeSearch` is `DdgSafeSearch` (`'Off' | 'Moderate' | 'Strict'`) and defaults to `'Moderate'`, DDG's own default. `src/common/SafeSearchParam.ts` maps each level to DDG's value.

| Level | `SafeSearchParam` | `p` cookie | `i.js` `p` URL param | Marker in scraped `d.js` URL |
|---|---|---|---|---|
| `Off` | `-2` | `p=-2` | `-2` | `ex=-2` |
| `Moderate` | `-1` | none | `-1` | `ex=-1` |
| `Strict` | `1` | `p=1` | `1` | `p=1` |

- **Cookie.** `new GlobalSearchOptions(options).apply(headers)` runs on all four requests (token and search, both clients). It returns a copy, so the shared static header constants never pick up a cookie.
- **Image.** `i.js` carries the level twice: the `p` URL parameter, always sent, and the cookie.
- **Web.** DDG bakes the level into the signed URL when the page is fetched, so the cookie on `generateToken` is what takes effect and the level cannot be changed on a scraped URL. The `d.js` request sends the cookie too, as a browser would. The markers in the last column are asserted by the live tests in `test/web/WebSearchClient.test.ts`.

## Parsers

### ImageSearchParser

`parse(responseText): ImageSearchResult[]`

1. `JSON.parse`s the body as `IDdgResponse`.
2. If `response.challenge` is present, throws `BotChallengeError(response.challenge.cc ?? 'unknown')`. DDG sends `challenge` in place of `results` when it suspects a bot.
3. Maps each `results` entry (`image`, `thumbnail`) to `new ImageSearchResult(result.thumbnail, result.image)`.

### WebSearchParser

`parse(responseText): WebSearchResult[]`

1. Locates `RESULTS_MARKER`, `DDG.pageLayout.load('d',`, then the first `[` after it.
2. `findMatchingBracket` finds the closing `]`, tracking `depth` and `isInString` (with backslash escapes) so brackets inside JSON strings are not counted.
3. `JSON.parse`s the slice as `IDdgWebResult[]`.
4. Maps entries to `WebSearchResult`, skipping any without `t` (title) or `u` (URL). `a` (snippet) defaults to `''`.

## Data Models

`ImageSearchResult(thumbnailUrl, imageUrl)`: the constructor order is thumbnail first, while DDG's objects name the fields `image` and `thumbnail`.

`WebSearchResult(title, url, description)`: from `t`, `u` and `a`.

## DuckDuckGo Protocol Quirks

These make the library brittle and are why the tests hit the live API ([testing.md](testing.md#live-integration-tests)).

1. **Image search token (vqd).** Scraped from page HTML; a format change breaks `TOKEN_REGEX`. Required on every `i.js` call.
2. **Web search URL (signed `dp`).** Cannot be constructed; the exact `d.js` URL must be scraped from the page.
3. **Image option encoding.** `f` is positional; see [Image Search](#image-search-imagesearchclient).
4. **Web response format.** Results are embedded in a `DDG.pageLayout.load('d', [...])` JavaScript call, requiring marker-based extraction and bracket matching.
5. **Browser imitation.** Image search sends a Linux Chrome user-agent with `x-requested-with: XMLHttpRequest`. Web search sends a Windows Chrome user-agent with `sec-ch-ua` and `sec-fetch-*` headers.
6. **Content encoding.** `node-http-toolkit`'s `HttpResponseReader` decompresses gzip, deflate and brotli and throws on anything else, including `zstd`.
7. **Bot challenges.** `i.js` can answer with a `challenge` object instead of `results`. `cc` is an undocumented category such as `botnet`. Usually temporary: a search on the real website clears it.

## Error Handling

Clients and parsers throw rather than log or swallow; everything propagates through `DuckDuckGo`.

| Failure | Thrown |
|---|---|
| Image token not found | `Error('Unable to read token from DuckDuckGo response.')` |
| Web search URL not found | `Error('Unable to read search URL from DuckDuckGo response.')` |
| `i.js` body has `challenge` | `BotChallengeError` |
| `i.js` body not JSON or lacks `results` | `SyntaxError` from `JSON.parse`, or `TypeError` from iterating `undefined` |
| `d.js` marker missing or array unbalanced | `Error('Unable to read results from DuckDuckGo response.')` |
| `d.js` array is not valid JSON | `SyntaxError` from `JSON.parse` |
| HTTP status >= 400 | `HttpError` from `node-http-toolkit` |
| Network error, more than 10 redirects, other unexpected status | Rejection from `AsyncResolvingHttpRequest` |

No request timeout is configured, so a stalled connection can hang indefinitely.

`BotChallengeError` (`src/common/BotChallengeError.ts`) exposes `reason` (`cc`, or `unknown`) and a fixed `name` of `'BotChallengeError'`, so callers can identify it where `instanceof` fails because an app loaded both the ESM and CJS builds. Only `ImageSearchParser` throws it. Web search and both token steps have no challenge detection, so a challenge there surfaces as the generic errors above.

## Exports

`src/index.ts` is the only public surface, listed in [overview.md](overview.md#public-api). The clients, parsers, `GlobalSearchOptions` and `SafeSearchParam` are internal.
