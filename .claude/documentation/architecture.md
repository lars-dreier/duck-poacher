---
title: "Architecture & Internals"
description: "How duck-poacher works inside: the DuckDuckGo composition root, ImageSearchClient and ImageSearchSession (vqd token reuse), WebSearchClient and the shared DdgHttpClient, the token→search→parse flow, image filter encoding, safe search handling, parsers, bot-challenge detection, DuckDuckGo protocol quirks and error handling."
category: "architecture"
tags: ["architecture", "design", "ddg", "search-strategy", "data-flow", "internals", "safe-search", "bot-challenge", "session"]
last_updated: "2026-11-12T18:03:30Z"
related_docs: ["ddg-protocol.md", "overview.md", "code-style.md", "testing.md"]
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

How the package implements DuckDuckGo's protocol. The protocol itself (tokens, parameters, safe search values, bot
detection, browser headers) is described in [ddg-protocol.md](ddg-protocol.md).

## Client Layers and Parsers

Image and web search each have their own client, parser and result class, because DuckDuckGo's two endpoints authenticate and respond differently.

- **Facade**: `src/DuckDuckGo.ts` hides the two-step token and search sequence and is the composition root.
- **Client**: `src/image/ImageSearchClient.ts`, `src/web/WebSearchClient.ts` own token generation, header sets and URL construction.
- **Session**: `src/image/ImageSearchSession.ts` holds one image query and its vqd token and runs searches on it.
- **HTTP**: `src/common/DdgHttpClient.ts` performs every GET through `get(url, headers, options?)`, applying the shared options to the headers and returning the decoded body.
- **Parser**: `src/image/ImageSearchParser.ts`, `src/web/WebSearchParser.ts` extract results from DDG's response formats.
- **Result**: `src/image/ImageSearchResult.ts`, `src/web/WebSearchResult.ts` are immutable value objects.
- **Shared**: `src/common/` also holds `DdgSearchOptions.ts` (shared option types), `GlobalSearchOptions` (translates shared options into headers and URL values), `SafeSearchCookie` and `SafeSearchParam` (DDG's level values) and `BotChallengeError`.

Each client receives its parser and a `DdgHttpClient` as the constructor parameters `_parser` and `_httpClient`. `DuckDuckGo` builds the graph in its field initializers: `new ImageSearchClient(new ImageSearchParser(), new DdgHttpClient())` and `new WebSearchClient(new WebSearchParser(), new DdgHttpClient())`. Rules are in [code-style.md](code-style.md#dependency-injection).

## End-to-End Flow

### Image Search Flow

```
DuckDuckGo.imageSearch(query, options?)
  ↓ createImageSearchSession(query)
ImageSearchClient.generateToken(query)
  ↓ (GET duckduckgo.com without options, so no safe search cookie; scrape vqd)
ImageSearchSession.search(options) → ImageSearchClient.imageSearch(query, token, options)
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

Holds no state between calls. `imageSearch` and `webSearch` each mint a fresh token and make two live HTTP requests. `imageSearch` runs a one-off session: `createImageSearchSession(query)` then `session.search(options)`. `createImageSearchSession` calls `generateToken(query)` without options, because the vqd does not depend on them ([ddg-protocol.md](ddg-protocol.md#the-vqd-token)). `webSearch` passes `options` to `generateToken` only.

`ImageSearchSession` is exported as a type only, so instances come from `createImageSearchSession`. It keeps `query` (public) and the token (private), and `search(options?)` calls `ImageSearchClient.imageSearch(query, token, options)`. Each search is therefore one `i.js` request, and filters and safe search level may differ per search. The session never re-mints its token, so a session used past a full UTC hour sends the previous hour's vqd ([ddg-protocol.md](ddg-protocol.md#the-vqd-token)).

## Image Search: ImageSearchClient

`generateToken(query, options?: DdgSearchOptions): Promise<string>`

1. GETs `https://duckduckgo.com/?q=...&atb=v299-1&iar=images&iax=images&ia=images` with `TOKEN_HEADERS` plus any safe search cookie (the facade passes no options).
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

`GlobalSearchOptions` resolves an omitted `safeSearch` to `'Moderate'`, DDG's own default. `SafeSearchCookie` holds DDG's `p` cookie values and `SafeSearchParam` its `i.js` `p` URL values; the two differ for `Off`. The values per level are in [ddg-protocol.md](ddg-protocol.md#safe-search).

- **Cookie.** `DdgHttpClient.get` runs `new GlobalSearchOptions(options).apply(headers)` on every request. `apply` returns a copy, so the shared static header constants never pick up a cookie. The `i.js` and web token requests pass `options` to it; the image token request, as called by the facade, passes none.
- **Image.** `i.js` carries the level twice: the `p` URL parameter, always sent, and the cookie. `Moderate` and `Strict` share a URL value, so only the cookie tells them apart.
- **Web.** DDG bakes the level into the signed URL when the page is fetched, so the cookie on `generateToken` is what takes effect and the level cannot be changed on a scraped URL. The `d.js` request passes no options and so carries no cookie, as a browser sends none to `links.duckduckgo.com`. The level markers in the scraped URL (`ex=-2`, `ex=-1`, `p=1`) are asserted by the live tests in `test/web/WebSearchClient.live.test.ts`.

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

What the package depends on, and so where a DDG change breaks it first. The protocol details are in
[ddg-protocol.md](ddg-protocol.md); these are why the tests hit the live API
([testing.md](testing.md#live-integration-tests)).

1. **Scraped tokens.** `TOKEN_REGEX` reads the vqd from page HTML and `SEARCH_URL_REGEX` reads the signed `d.js` URL;
   a markup change breaks either. `SEARCH_URL_REGEX` only matches the absolute URL of the web tab, not the relative one
   the images tab embeds.
2. **Positional filters.** `f` is positional; see [Image Search](#image-search-imagesearchclient).
3. **Web response format.** Results are embedded in a `DDG.pageLayout.load('d', [...])` call, which `WebSearchParser`
   extracts by marker and bracket matching.
4. **Browser imitation.** Image search sends a Firefox on macOS user-agent on both requests. Web search sends a Windows
   Chrome user-agent with `sec-ch-ua` and `sec-fetch-*` headers on `d.js`, and only `dnt` on the page fetch. Node sends
   HTTP/1.1 and appends `Host` and `Connection` after the given headers unless they are set; browsers send HTTP/2 with
   `Host` first ([profiles](ddg-protocol.md#browser-request-profiles)).
5. **Content encoding.** `node-http-toolkit`'s `HttpResponseReader` decompresses gzip, deflate and brotli and throws on
   anything else, including `zstd`, so the clients' `accept-encoding` headers omit `zstd`.
6. **Bot challenges.** The package sends none of the challenge values (`jsa`, `jsa_hash`, `dp`) browsers add to `i.js`
   and does not try to solve the challenge, so DDG blocks `i.js` after a burst of requests. Token pages and web search
   kept working during such blocks. Both block forms, a `challenge` body and an HTTP 403, become `BotChallengeError`
   ([forms](ddg-protocol.md#bot-detection)). Usually temporary: waiting, or a search on the real website, clears it.

## Error Handling

Clients and parsers throw rather than log or swallow; everything propagates through `DuckDuckGo` and `ImageSearchSession`.

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
