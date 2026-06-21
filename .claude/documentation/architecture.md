---
title: "Architecture & Internals"
description: "How duck-poacher works inside: the DuckDuckGo facade, ImageSearchClient and WebSearchClient implementations, the token→search→parse flow, DdgSearchOptions encoding, data models, and DuckDuckGo protocol quirks."
category: "architecture"
tags: ["architecture", "design", "ddg", "search-strategy", "data-flow", "internals"]
last_updated: "2026-06-21T10:00:32Z"
related_docs: ["overview.md", "code-style.md", "testing.md"]
---

# Architecture & Internals

## Table of Contents

1. [Client Layers and Parsers](#client-layers-and-parsers)
2. [End-to-End Flow](#end-to-end-flow)
3. [The Facade: DuckDuckGo](#the-facade-duckduckgo)
4. [Image Search: ImageSearchClient](#image-search-imagesearchclient)
   - [Token Generation](#token-generation)
   - [Image Search and Option Encoding](#image-search-and-option-encoding)
5. [Web Search: WebSearchClient](#web-search-websearchclient)
   - [Token Generation (Search URL)](#token-generation-search-url)
   - [Web Search Execution](#web-search-execution)
6. [Parsers](#parsers)
   - [ImageSearchParser](#imagesearchparser)
   - [WebSearchParser](#websearchparser)
7. [Data Models](#data-models)
8. [DuckDuckGo Protocol Quirks](#duckduckgo-protocol-quirks)
9. [Error Handling](#error-handling)
10. [Exports](#exports)

---

## Client Layers and Parsers

duck-poacher follows a three-layer architecture for each search type (image and web):

- **Facade**: `src/DuckDuckGo.ts` — High-level API hiding async token generation
- **Client**: `src/image/ImageSearchClient.ts`, `src/web/WebSearchClient.ts` — Handle HTTP requests, token generation, URL construction, and search execution
- **Parser**: `src/image/ImageSearchParser.ts`, `src/web/WebSearchParser.ts` — Extract structured data from DuckDuckGo's proprietary response formats
- **Result**: `src/image/ImageSearchResult.ts`, `src/web/WebSearchResult.ts` — Data classes modeling search results

This separation enables independent protocol handling for each search type, since DuckDuckGo's image and web endpoints have different authentication and response schemes.

## End-to-End Flow

### Image Search Flow

```
User calls DuckDuckGo.imageSearch(query, options?)
  ↓
Facade calls ImageSearchClient.generateToken(query)
  ↓ (HTTP GET to duckduckgo.com, scrape vqd token from response)
  ↓
Facade calls ImageSearchClient.imageSearch(query, token, options)
  ↓ (HTTP GET to duckduckgo.com/i.js with encoded parameters)
  ↓
ImageSearchParser.parse(responseText)
  ↓ (Extract JSON array, map to ImageSearchResult instances)
  ↓
Returns Promise<ImageSearchResult[]>
```

### Web Search Flow

```
User calls DuckDuckGo.webSearch(query)
  ↓
Facade calls WebSearchClient.generateToken(query)
  ↓ (HTTP GET to duckduckgo.com, scrape full search URL from <script> tag)
  ↓
Facade calls WebSearchClient.webSearch(query, searchUrl)
  ↓ (HTTP GET to links.duckduckgo.com/d.js?... with signed params)
  ↓
WebSearchParser.parse(responseText)
  ↓ (Extract JSON array from DDG.pageLayout.load('d', [...]) call)
  ↓
Returns Promise<WebSearchResult[]>
```

## The Facade: DuckDuckGo

Located at `src/DuckDuckGo.ts`, this class provides the primary entry point for library users:

```typescript
export default class DuckDuckGo {
  private readonly _imageSearch = new ImageSearchClient();
  private readonly _webSearch = new WebSearchClient();

  public async imageSearch(query: string, options?: DdgSearchOptions): Promise<ImageSearchResult[]>
  public async webSearch(query: string): Promise<WebSearchResult[]>
}
```

**Responsibilities:**

- Owns one `ImageSearchClient` and one `WebSearchClient` instance (one per facade instance)
- Coordinates token generation and search execution for image queries
- Coordinates token/URL generation and search execution for web queries
- Hides the two-step (token → search) process from callers

**Design notes:**

- Both methods are `async` to reflect the asynchronous HTTP nature
- `imageSearch` accepts optional `DdgSearchOptions` for filtering; `webSearch` does not (DuckDuckGo's web endpoint does not expose filter parameters)
- Token generation is NOT exposed to consumers; it's an implementation detail

## Image Search: ImageSearchClient

Located at `src/image/ImageSearchClient.ts`. Handles HTTP communication with DuckDuckGo's image search endpoint.

### Token Generation

```typescript
public async generateToken(query: string): Promise<string>
```

**What it does:**
1. Constructs a URL to `https://duckduckgo.com/?q=...&atb=v299-1&iar=images&iax=images&ia=images`
2. Sends an HTTP GET request with minimal headers (`dnt: 1`)
3. Parses the HTML response using regex `/vqd=(?<vqd>[\d-]+)/` to extract the `vqd` token
4. Returns the token string (e.g., `"1-2-3-4-5"`)

**Error handling:** Throws `Error('Unable to read token from DuckDuckGo response.')` if the regex does not match.

**Protocol note:** The `atb`, `iar`, `iax`, and `ia` parameters signal to DuckDuckGo that this is an image search request, triggering the vqd token in the response.

### Image Search and Option Encoding

```typescript
public async imageSearch(
  query: string,
  token: string,
  options?: DdgSearchOptions
): Promise<ImageSearchResult[]>
```

**What it does:**
1. Constructs a search URL to `https://duckduckgo.com/i.js?l=de-de&o=json&q=...&vqd=...&f=...&p=...`
2. Encodes search options (time, size, color, type, layout, license, safeSearch) into the `f` parameter and safe search into `p`
3. Sends an HTTP GET request with full browser-like headers
4. Passes the response to `ImageSearchParser.parse()`

**URL Parameters:**
- `l`: Locale (hardcoded to `de-de`)
- `o`: Output format (always `json`)
- `q`: Search query
- `vqd`: Token from `generateToken()`
- `f`: Encoded filter string (see below)
- `p`: Safe search flag (`1` if enabled, `-1` if disabled)

**Option Encoding (`createImageSearchOptionsHeader`):**

The six image filter options map to a comma-separated string, **in a fixed order** defined by `OPTION_NAMES = ['time', 'size', 'color', 'type', 'layout', 'license']`. For each option in that order:
- If not provided: append an empty slot
- If provided: append `optionName:optionValue`

So `{ size: 'Large', layout: 'Square' }` encodes to `,size:Large,,,layout:Square,` — the empty commas are positional placeholders DDG expects. **The order in `OPTION_NAMES` is load-bearing** (the source comments `// Order is important`); reordering it would mis-map filters. `safeSearch` is handled separately as the `p` parameter, not part of `f`.

**Type `DdgSearchOptions`:**

```typescript
export type DdgSearchOptions = {
  time?: DdgTime;        // 'Day' | 'Week' | 'Month'
  size?: DdgSize;        // 'Small' | 'Medium' | 'Large' | 'Wallpaper'
  color?: DdgColor;      // 'color' | 'Monochrome'
  type?: DdgType;        // 'photo' | 'clipart' | 'gif' | 'transparent' | 'line'
  layout?: DdgLayout;    // 'Square' | 'Tall' | 'Wide'
  license?: DdgLicense;  // 'Any' | 'Public'
  safeSearch?: boolean;
};
```

All fields are optional; missing fields result in an empty value in the `f` string.

## Web Search: WebSearchClient

Located at `src/web/WebSearchClient.ts`. Handles HTTP communication with DuckDuckGo's web search endpoint.

### Token Generation (Search URL)

```typescript
public async generateToken(query: string): Promise<string>
```

**What it does:**
1. Constructs a URL to the DuckDuckGo HTML search page for the query
2. Sends an HTTP GET request with minimal headers (`dnt: 1`)
3. Parses the HTML response with a regex (`SEARCH_URL_REGEX`) to extract the full `links.duckduckgo.com/d.js?...` search URL embedded in a `<script>` tag
4. Returns the full search URL string

**Error handling:** Throws `Error('Unable to read search URL from DuckDuckGo response.')` if the regex does not match.

**Protocol notes:**
- Unlike image search, `generateToken` returns a complete, ready-to-fetch search URL rather than a bare token
- The returned URL contains a signed `dp` parameter that only DuckDuckGo's page JavaScript can mint. The exact URL scraped from the page must be used; constructing a custom URL will fail

### Web Search Execution

```typescript
public async webSearch(query: string, searchUrl: string): Promise<WebSearchResult[]>
```

**What it does:**
1. Sends an HTTP GET request to the provided `searchUrl` (`https://links.duckduckgo.com/d.js?...`)
2. Uses full modern Chrome headers (including `sec-ch-ua`, `sec-fetch-*`, and a Windows user-agent)
3. Passes the response to `WebSearchParser.parse()`

**Headers:**
- User-Agent mimics Chrome on Windows (required; DuckDuckGo validates this)
- `sec-fetch-dest: script` and no `x-requested-with` (the browser loads d.js via a `<script>` tag)
- `accept-encoding` omits `zstd` (since `node-http-toolkit`'s `HttpResponseReader` cannot decode it)

## Parsers

### ImageSearchParser

Located at `src/image/ImageSearchParser.ts`.

```typescript
public parse(responseText: string): ImageSearchResult[]
```

**What it does:**
1. Parses the response text as JSON: `JSON.parse(responseText)`
2. Extracts the `results` array (type `DdgResult[]`) from the response object
3. Maps each result to `new ImageSearchResult(result.thumbnail, result.image)`

**Response shape:**

```typescript
interface DdgResponse {
  results: DdgResult[];
}

interface DdgResult {
  image: string;     // Full-size image URL
  thumbnail: string; // Thumbnail image URL
}
```

`DdgResponse` and `DdgResult` are `interface`s in the same file — partly because the project enforces `max-classes-per-file: 1` (see [code-style.md](code-style.md#one-class-per-file)).

### WebSearchParser

Located at `src/web/WebSearchParser.ts`.

```typescript
public parse(responseText: string): WebSearchResult[]
```

**What it does:**
1. Searches for the marker string `DDG.pageLayout.load('d',` in the response
2. Finds the matching `[` and closing `]` for the JSON array (handling nested brackets and quoted strings via a custom `findMatchingBracket` helper)
3. Extracts the array-literal substring and `JSON.parse`s it
4. Maps each entry to a `WebSearchResult`, skipping entries missing `t` (title) or `u` (URL)

**Response shape (embedded in page):**

```typescript
interface DdgWebResult {
  t?: string; // Title
  u?: string; // URL
  a?: string; // Description / snippet
}
```

**Bracket matching (`findMatchingBracket`):** a small scanner that finds the closing `]` while respecting string literals (so JSON values containing brackets are not misread as array boundaries). It tracks `depth` (open `[` minus closed `]`) and `inString` (handling escaped quotes).

## Data Models

### ImageSearchResult

`src/image/ImageSearchResult.ts`:

```typescript
export default class ImageSearchResult {
  public constructor(
    public readonly thumbnailUrl: string,
    public readonly imageUrl: string,
  ) {}
}
```

Immutable (both fields `readonly`, set via constructor parameter properties). Note the **constructor argument order is `thumbnailUrl, imageUrl`** but the parser maps from DDG's `{ image, thumbnail }` — `new ImageSearchResult(result.thumbnail, result.image)`. Keep that mapping straight when touching either side.

### WebSearchResult

`src/web/WebSearchResult.ts`:

```typescript
export default class WebSearchResult {
  public constructor(
    public readonly title: string,
    public readonly url: string,
    public readonly description: string,
  ) {}
}
```

- `title` — page title (from `t`)
- `url` — page URL (from `u`)
- `description` — snippet (from `a`, defaults to empty string if missing)

## DuckDuckGo Protocol Quirks

These are the reasons the library is brittle and why the tests hit the live API ([testing.md](testing.md#live-integration-tests)):

1. **Image search token (vqd).** Scraped from page HTML with a regex; format is hyphen-separated digits and can drift, breaking `TOKEN_REGEX`. Required on every `imageSearch` call.
2. **Web search URL (signed `dp`).** The `dp` parameter is a signed blob minted only by DuckDuckGo's page JavaScript. It cannot be constructed manually — the exact `links.duckduckgo.com/d.js` URL must be scraped from a `<script>` tag.
3. **Image option encoding.** Filter options must be in `OPTION_NAMES` order; absent options contribute empty slots so positional alignment with DDG's parser holds.
4. **Web response format.** Results are embedded in a JavaScript call (`DDG.pageLayout.load('d', [...])`), not a standalone JSON envelope, so they require marker-based extraction and bracket matching.
5. **Browser simulation.** DDG validates `user-agent` and `sec-*` headers. Image search uses a browser user-agent with `x-requested-with: XMLHttpRequest`; web search uses a Windows Chrome user-agent with `sec-fetch-dest: script`.
6. **Transport / content encoding.** Responses are chunked and gzip/deflate/br-compressed. `node-http-toolkit`'s `HttpResponseReader` decompresses gzip/deflate/brotli but NOT zstd, so web search omits `zstd` from `accept-encoding`. Requests go through `AsyncResolvingHttpRequest`, which follows redirects and rejects on HTTP ≥ 400.

## Error Handling

Both clients **fail fast** and throw rather than logging or swallowing:

1. **Token / URL generation failures.**
   - `ImageSearchClient.generateToken`: `Error('Unable to read token from DuckDuckGo response.')`
   - `WebSearchClient.generateToken`: `Error('Unable to read search URL from DuckDuckGo response.')`
2. **Search execution failures.** HTTP-level failures (status ≥ 400, network errors, timeouts) reject from the underlying `node-http-toolkit` request and propagate out.
3. **Parsing failures.** `ImageSearchParser.parse` does not guard its input — a non-JSON body throws from `JSON.parse`, and a missing `results` throws when iterated. `WebSearchParser.parse` throws if the marker is not found or bracket matching / `JSON.parse` fails. All propagate to the `imageSearch` / `webSearch` caller through `DuckDuckGo`. This is deliberate — a malformed response is a real failure, not something to paper over.

## Exports

The public API is defined in `src/index.ts`:

```typescript
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
export { default as WebSearchResult } from './web/WebSearchResult.ts';
```

**Exported:** `DuckDuckGo`, `ImageSearchResult`, `WebSearchResult`, and the image `Ddg*` types. **Not exported:** `ImageSearchClient`, `WebSearchClient`, the parsers, and the parsers' internal interfaces (`DdgResponse`, `DdgResult`, `DdgWebResult`) — callers receive parsed results from `DuckDuckGo.imageSearch` / `DuckDuckGo.webSearch` and never need them directly (see [overview.md](overview.md#public-api)).
