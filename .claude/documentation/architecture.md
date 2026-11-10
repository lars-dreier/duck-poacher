---
title: "Architecture & Internals"
description: "How duck-poacher works inside: the DuckDuckGo composition root, ImageSearchClient, WebSearchClient and the shared DdgHttpClient, the token→search→parse flow, image filter encoding, safe search handling, parsers, bot-challenge detection, DuckDuckGo protocol quirks and error handling."
category: "architecture"
tags: ["architecture", "design", "ddg", "search-strategy", "data-flow", "internals", "safe-search", "bot-challenge"]
last_updated: "2026-11-09T21:41:39Z"
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

---

## Client Layers and Parsers

Image and web search each have their own client, parser and result class, because DuckDuckGo's two endpoints authenticate and respond differently.

- **Facade**: `src/DuckDuckGo.ts` hides the two-step token and search sequence and is the composition root.
- **Client**: `src/image/ImageSearchClient.ts`, `src/web/WebSearchClient.ts` own token generation, header sets and URL construction.
- **HTTP**: `src/common/DdgHttpClient.ts` performs every GET through `get(url, headers, options?)`, applying the shared options to the headers and returning the decoded body.
- **Parser**: `src/image/ImageSearchParser.ts`, `src/web/WebSearchParser.ts` extract results from DDG's response formats.
- **Result**: `src/image/ImageSearchResult.ts`, `src/web/WebSearchResult.ts` are immutable value objects.
- **Shared**: `src/common/` also holds `DdgSearchOptions.ts` (shared option types), `GlobalSearchOptions` (translates shared options into headers and URL values), `SafeSearchCookie` and `SafeSearchParam` (DDG's level values) and `BotChallengeError`.

Each client receives its parser and a `DdgHttpClient` as the constructor parameters `_parser` and `_httpClient`. `DuckDuckGo` builds the graph in its field initializers: `new ImageSearchClient(new ImageSearchParser(), new DdgHttpClient())` and `new WebSearchClient(new WebSearchParser(), new DdgHttpClient())`. Rules are in [code-style.md](code-style.md#dependency-injection).

## End-to-End Flow

### Image Search Flow

```
DuckDuckGo.imageSearch(query, options?)
  ↓
ImageSearchClient.generateToken(query, options)
  ↓ (GET duckduckgo.com with safe search cookie, scrape vqd)
ImageSearchClient.imageSearch(query, token, options)
  ↓ (GET duckduckgo.com/i.js with f and p params and safe search cookie; HTTP 403 → BotChallengeError)
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
WebSearchClient.webSearch(query, searchUrl)
  ↓ (GET links.duckduckgo.com/d.js?... without a cookie)
WebSearchParser.parse(responseText)
  ↓ (extract array from DDG.pageLayout.load('d', [...]))
Promise<WebSearchResult[]>
```

## The Facade: DuckDuckGo

Stateless across calls. Each search makes two live HTTP requests, minting a fresh token first. `imageSearch` passes `options` to both steps; `webSearch` passes them to `generateToken` only.

## Image Search: ImageSearchClient

`generateToken(query, options?: DdgSearchOptions): Promise<string>`

1. GETs `https://duckduckgo.com/?q=...&atb=v299-1&iar=images&iax=images&ia=images` with `TOKEN_HEADERS` plus any safe search cookie.
2. Extracts the token with `TOKEN_REGEX`, `/vqd=(?<vqd>[\d-]+)/`.

`imageSearch(query, token, options?: DdgImageSearchOptions): Promise<ImageSearchResult[]>`

GETs `https://duckduckgo.com/i.js` with `SEARCH_HEADERS` plus any safe search cookie, and hands the body to `_parser.parse`. URL parameters, built in `createSearchUrl`:

- `l`: `us-en` (hardcoded)
- `o`: `json`
- `q`: query
- `vqd`: token
- `f`: positional filter string
- `p`: safe search level ([Safe Search](#safe-search))

`TOKEN_HEADERS` and `SEARCH_HEADERS` extend `BROWSER_HEADERS` (Firefox on macOS) with the `accept` and `sec-fetch-*` values of a top-level page load and of the page's fetch of `i.js` respectively.

**Filter encoding (`createImageSearchOptionsHeader`).** `f` is comma-joined in the fixed order of `OPTION_NAMES` (`time`, `size`, `color`, `type`, `layout`, `license`). A set option contributes `name:value`, an unset one an empty slot. `{ size: 'Large', layout: 'Square' }` encodes to `,size:Large,,,layout:Square,`. The order is load-bearing: reordering `OPTION_NAMES` mis-maps filters. `safeSearch` is not part of `f`.

Option types and values are listed in [overview.md](overview.md#public-api).

## Web Search: WebSearchClient

`generateToken(query, options?: DdgSearchOptions): Promise<string>`

1. GETs `https://duckduckgo.com/?q=...&ia=web&t=h_` with `TOKEN_HEADERS` (`dnt: 1`) plus any safe search cookie.
2. Extracts the full URL with `SEARCH_URL_REGEX`, `/https:\/\/links\.duckduckgo\.com\/d\.js\?[^"']+/`, and returns it.

The "token" is a complete, ready-to-fetch URL, not a bare value. It carries a signed `dp` parameter that only DuckDuckGo's page JavaScript can mint, so the scraped URL must be used as is.

`webSearch(query, searchUrl): Promise<WebSearchResult[]>`

GETs `searchUrl` with `SEARCH_HEADERS`, and hands the body to `_parser.parse`. `query` is unused: the scraped URL already encodes it.

`SEARCH_HEADERS` imitate Chrome on Windows making a script request, because the browser loads `d.js` through a `<script>` tag: `sec-fetch-dest: script` and no `x-requested-with`. The `sec-ch-ua` versions must track the user-agent.

## Safe Search

`GlobalSearchOptions` resolves an omitted `safeSearch` to `'Moderate'`, DDG's own default. `SafeSearchCookie` holds DDG's `p` cookie values and `SafeSearchParam` its `i.js` `p` URL values; the two differ for `Off`.

| Level | `p` cookie | `i.js` `p` URL param | Marker in scraped `d.js` URL |
|---|---|---|---|
| `Off` | `p=-2` | `-1` | `ex=-2` |
| `Moderate` | none | `1` | `ex=-1` |
| `Strict` | `p=1` | `1` | `p=1` |

- **Cookie.** `DdgHttpClient.get` runs `new GlobalSearchOptions(options).apply(headers)` on every request. `apply` returns a copy, so the shared static header constants never pick up a cookie. The image token, `i.js` and web token requests pass `options` to it.
- **Image.** `i.js` carries the level twice: the `p` URL parameter, always sent, and the cookie. `Moderate` and `Strict` share a URL value, so only the cookie tells them apart.
- **Web.** DDG bakes the level into the signed URL when the page is fetched, so the cookie on `generateToken` is what takes effect and the level cannot be changed on a scraped URL. The `d.js` request passes no options and so carries no cookie, as a browser sends none to `links.duckduckgo.com`. The markers in the last column are asserted by the live tests in `test/web/WebSearchClient.test.ts`.

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
5. **Browser imitation.** Image search sends a Firefox on macOS user-agent on both requests. Web search sends a Windows Chrome user-agent with `sec-ch-ua` and `sec-fetch-*` headers on `d.js`, and only `dnt` on the page fetch.
6. **Content encoding.** `node-http-toolkit`'s `HttpResponseReader` decompresses gzip, deflate and brotli and throws on anything else, including `zstd`, so the clients' `accept-encoding` headers omit `zstd`.
7. **Bot challenges.** DDG gates `i.js` with a browser-side challenge, which its scripts call SerpChallenge. The results page embeds `window.__sc__`: a hash `h`, a signed blob `d`, and an obfuscated function `s` that needs a DOM to compute. DDG's scripts add the result as `jsa`, plus `jsa_hash` and `dp`, to their `i.js` requests. This library sends none of them and does not try to solve the challenge. DDG tolerates that for a burst of requests, then blocks `i.js` for the client. Token pages and web search keep working. A block arrives in one of two forms:
   - an HTTP 200 whose JSON carries a `challenge` object instead of `results`, where `cc` is an undocumented category such as `botnet`;
   - an HTTP 403 with a plain-text body.

   Both become `BotChallengeError`. Usually temporary: waiting, or a search on the real website, clears it.

## Error Handling

Clients and parsers throw rather than log or swallow; everything propagates through `DuckDuckGo`.

| Failure | Thrown |
|---|---|
| Image token not found | `Error('Unable to read token from DuckDuckGo response.')` |
| Web search URL not found | `Error('Unable to read search URL from DuckDuckGo response.')` |
| `i.js` body has `challenge` | `BotChallengeError` |
| `i.js` HTTP 403 | `BotChallengeError('forbidden')`, with the `HttpError` (headers and raw body) as `cause` |
| `i.js` body not JSON or lacks `results` | `SyntaxError` from `JSON.parse`, or `TypeError` from iterating `undefined` |
| `d.js` marker missing or array unbalanced | `Error('Unable to read results from DuckDuckGo response.')` |
| `d.js` array is not valid JSON | `SyntaxError` from `JSON.parse` |
| Any other HTTP status >= 400 | `HttpError` from `node-http-toolkit` |
| Network error, more than 10 redirects, other unexpected status | Rejection from `AsyncResolvingHttpRequest` |

No request timeout is configured, so a stalled connection can hang indefinitely.

`BotChallengeError` (`src/common/BotChallengeError.ts`) exposes `reason` (`cc`, `unknown`, or `forbidden` for a 403), an optional standard `cause`, and a fixed `name` of `'BotChallengeError'`. The fixed `name` lets callers identify it where `instanceof` fails because an app loaded both the ESM and CJS builds. `ImageSearchParser` throws it for a `challenge` body, and `ImageSearchClient.imageSearch` throws it for a 403 from `i.js`. Web search and both token steps have no challenge detection, so a challenge there surfaces as the generic errors above.
