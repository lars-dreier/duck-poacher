# Search pagination — Technical Overview: page through image and web results

Implementation document for duck-poacher (`src/`). It states the requirements and maps each of them to the concrete
file/class/method that satisfies or must change it. Everything needed to implement is in this file.

> **Status, re-assessed 2026-11-13.** Branch `feature/pagination` points at `develop` (`6d0b74d`, "Merge branch
> 'feature/image-token-reuse' into develop"); nothing is committed for this feature yet. The token-reuse work
> (`ImageSearchSession`, `DuckDuckGo.createImageSearchSession`) is merged to `develop` but **not** to `main` (`main` is
> at `bd310bb`, release 0.8.2). This feature builds on it; `develop` is the base, and the two ship together.
> Baseline caveat: the two header-order specs in `test/image/ImageSearchClient.test.ts`
> (`generateToken` "sends Firefox's page load headers in Firefox's order" and `imageSearch` "sends Firefox's i.js
> headers in Firefox's order") expect `host` and `connection` keys that `ImageSearchClient.BROWSER_HEADERS` /
> `TOKEN_HEADERS` / `SEARCH_HEADERS` do not contain, so they fail on the current tree independently of this feature.
> Do not "fix" them as part of this work. Every path and member below verified against the current working tree.

## 1. Goal & context

duck-poacher returns only DuckDuckGo's first page for image search (70 to 100 images) and web search (about 10 to 15
results), although DDG pages both endpoints. This feature lets a caller fetch further pages on demand, one page per
explicit request, with the same consumption model for image and web search: each page object carries its results, says
whether a further page exists, and can fetch that next page.

### Contracts

DDG documents none of this. Sources: `.claude/documentation/ddg-protocol.md` (browser observations 2026-11-12) and a
live check on 2026-11-13.

**Image search: `GET https://duckduckgo.com/i.js`**

- Page 1 request, built by `ImageSearchClient.createSearchUrl`: `l=us-en`, `o=json`, `q`, `vqd`, `f` (positional
  filters, always sent), `p` (safe search URL value), plus the safe search `p` cookie applied by
  `DdgHttpClient.get` through `GlobalSearchOptions.apply`. No offset, so DDG returns page 1.
- The JSON response has a top-level `next`: a **relative** URL to the next page. Live, 2026-11-13, for
  `q=mountain landscape`:
  - unfiltered: `i.js?q=mountain%20landscape&o=json&p=1&s=100&u=bing&f=,,,,,&l=us-en`
  - with `f=,size:Large,,,,`: `i.js?q=mountain%20landscape&o=json&p=1&s=100&u=bing&f=,size:Large,,,,&l=us-en`

  So `next` carries the query, `p`, the filters `f` and locale `l` of the request it answers, advances `s` (by 100 per
  page per browser observation) and adds `u=bing`. It carries **no `vqd`**. The browser appends the same vqd to every
  page.
- The response also carries `vqd: { "<encoded query>": "4-…" }`; it equalled the request's vqd. The package ignores it.
- Safe search: `Moderate` and `Strict` share `p=1` and differ only by the cookie. A page request must send the same
  options (hence the same cookie) as page 1, or the level silently changes.
- A blocked request returns a `challenge` body or HTTP 403; both already map to `BotChallengeError`.

**Web search: `GET https://links.duckduckgo.com/d.js`**

- Page 1 is the absolute, signed URL that `WebSearchClient.generateToken` scrapes from the results page. Its `dp`
  signature covers every parameter (offset and safe search level included), so **no `d.js` URL can be built or
  edited client-side**.
- The response is JavaScript calling `DDG.pageLayout.load('d', [ … ])`. One entry of that array carries `n`: the next
  page's `d.js` URL, **relative** (`/d.js?q=…&s=10…`), with its own `dp`. Browser observations put it on the last
  entry; the parser test fixture has it as a standalone trailing entry `{"n":"/d.js?q=lm%20studio&s=10"}` without
  `t`/`u`, which `WebSearchParser.parse` drops today.
- Offsets are uneven (`0`, `10`, `25`, `40`) and each page's URL exists only in the previous response, so web pages are
  strictly sequential.
- The browser fetches `n` pages from `links.duckduckgo.com` (same host as page 1) and sends no cookie there.

**Effects outside the package's control**

- **vqd rotation.** The vqd changes on the full UTC hour. Whether `i.js` accepts the previous hour's vqd is unknown, so
  image paging across an hour boundary may fail. `ImageSearchSession` carries the same risk today.
- **`d.js` URL lifetime** is unknown; a caller pausing long between web pages may get an error.
- **Bot blocking.** Every image page is one more `i.js` request without challenge values. DDG tolerates a burst and
  then blocks (`BotChallengeError`); paging makes blocks more likely. The package does not try to solve or evade it.

## 2. Requirements

### Acceptance criteria

1. Image search and web search both support fetching further pages.
2. A further page is fetched only on an explicit call; the package never prefetches and never fetches several pages
   in one call.
3. Image and web paging have the same public shape (`results`, `hasNextPage`, `fetchNextPage()`).
4. A failed page request rejects with the same errors searches throw today. Afterwards the caller can request the same
   page again, and pages already received stay valid.
5. The paging position lives only in the in-memory page object; it is not serializable or resumable elsewhere.
6. `DuckDuckGo.imageSearch`, `DuckDuckGo.webSearch` and `ImageSearchSession.search` keep their signatures, return
   types and behaviour (first page, plain array, same requests). The feature is additive: a minor release.
7. New public types are exported from `src/index.ts`.

### Required behaviour

| Behaviour | Requirement | Implemented by |
|---|---|---|
| First page | New entry points return the first page as a page object | `DuckDuckGo.imageSearchPage`, `DuckDuckGo.webSearchPage`, `ImageSearchSession.searchPage` [NEW] |
| Page content | Each page's results in DDG's order, parsed exactly as page 1 is parsed today. The web `n` entry is never a result | `ImageSearchParser.parse`, `WebSearchParser.parse` [MODIFY] |
| Same search on every page | All pages use page 1's query, filters and safe search level; changing them means a new search | image: `next` carries `q`/`f`/`p`/`l`, and the page re-sends a frozen copy of page 1's options for the cookie; web: signed `n` URL |
| End of results | `hasNextPage` answers without a request. No `next` (image) / no `n` (web) means no further page. An empty page is returned as an empty page | `ImageSearchPage.hasNextPage`, `WebSearchPage.hasNextPage` [NEW] |
| Next page | `fetchNextPage()` is one awaited call, one HTTP request, no token request: image reuses page 1's vqd, web follows `n` | `ImageSearchPage.fetchNextPage`, `WebSearchPage.fetchNextPage` [NEW] |
| No next page | `fetchNextPage()` on a page with `hasNextPage === false` rejects with `Error('DuckDuckGo offers no further page for this search.')` and makes no request | same |
| Failure | Same errors as page 1: `BotChallengeError` for an `i.js` challenge body or HTTP 403; `Error('Unable to read results from DuckDuckGo response.')` for an unreadable `d.js` body; `HttpError` for other statuses; network rejections. The page object is not changed, so calling `fetchNextPage()` again repeats the same request | page objects are immutable |
| Concurrency | Two concurrent `fetchNextPage()` calls on one page send two identical requests and resolve independently; no shared state, no locking, no deduplication | page objects are immutable |
| Existing calls | Unchanged results and requests; they delegate to the paged path and return `.results` | `DuckDuckGo.imageSearch`, `DuckDuckGo.webSearch`, `ImageSearchSession.search` [MODIFY body only] |

### Must stay unchanged

- Public signatures and JSDoc contracts of `DuckDuckGo.imageSearch`, `DuckDuckGo.webSearch`,
  `DuckDuckGo.createImageSearchSession`, `ImageSearchSession.search`, `ImageSearchSession.query`.
- Page-1 request URLs, headers and cookie handling of both endpoints.
- `ImageSearchResult` and `WebSearchResult` (no new fields).
- Error mapping in `ImageSearchClient.fetchResults` and both parsers.

### Out of scope

- Serializable or resumable cursors.
- Fetching several pages per call, a "desired result count" option, async iteration over results.
- Random access to page N.
- Re-minting an expired vqd when paging crosses a UTC hour.
- Detecting the `d.js` bot gate (HTTP 202 with `window.execDeep`) as `BotChallengeError`; it stays the generic
  unreadable-results error.
- Deduplicating results repeated across pages.
- Updating `.claude/documentation/` (a separate refresh step) and bumping the package version.

### Constraints

- Web pages are strictly sequential; no `d.js` URL is built or modified.
- Page sizes are DDG's (image 70–100, web ~10–15), not controllable.
- No request timeout is configured; a stalled page request can hang like any request today.
- Code style per `.claude/documentation/code-style.md`: one default-exported class per file, explicit access
  modifiers and types, `_`-prefixed private members, member order fields → constructor → getters → methods, `.ts`
  import extensions, `import type` for type-only imports, three-plus call arguments on separate lines in `src/`,
  multiline JSDoc on every class and public method.

## 3. Key facts the design rests on

- **Page object.** An immutable object holding one page's `results`, whether a next page exists, and everything needed
  to fetch it. `ImageSearchPage` (`src/image/ImageSearchPage.ts`) and `WebSearchPage` (`src/web/WebSearchPage.ts`).
  Fetching the next page returns a **new** page object; the current one never changes. This alone gives the failure
  (retry by calling again), "earlier pages stay valid" and concurrency behaviour.
- **`SearchResponse<TResult>`.** Internal immutable value object (`src/common/SearchResponse.ts`): `results: TResult[]`
  and `nextUrl: string | undefined`. Parsers return it with DDG's raw relative `next`/`n`; clients return it with
  `nextUrl` resolved to the **absolute, ready-to-fetch** URL. Not exported from the barrel.
- **Next URL resolution.** Both relative forms resolve against the URL of the request they answer:
  `new URL(next, pageUrl)`. For `i.js` (`next` = `i.js?…`, page URL `https://duckduckgo.com/i.js?…`) this yields
  `https://duckduckgo.com/i.js?…`; for `d.js` (`n` = `/d.js?…`, page URL `https://links.duckduckgo.com/d.js?…`) it
  yields `https://links.duckduckgo.com/d.js?…`, the host the browser uses.
- **Image next URL = `next` + `vqd`.** Following `next` (rather than computing `s` and `u`) reproduces the browser and
  keeps whatever parameters DDG adds. The client appends page 1's token with `url.searchParams.set('vqd', token)`.
  Re-serialising an `i.js` URL through `searchParams` is safe: page 1 is already built with `URLSearchParams` (spaces
  as `+`, `,`/`:` percent-encoded) and DDG accepts it.
- **Web next URL is never re-serialised.** Use `new URL(n, pageUrl).href` only. Never touch `searchParams` of a `d.js`
  URL: re-encoding could alter the signed query and invalidate `dp`.
- **Image options are frozen per search.** The page stores a shallow copy (`{ ...options }`) of page 1's
  `DdgImageSearchOptions` and passes it to every page request, so `DdgHttpClient.get` sends the same safe search
  cookie. Filters and `p` travel inside `next`; the options are needed for the cookie only.
- **`WebSearchClient.webSearch`'s `query` parameter is unused today** (the scraped URL encodes the query). It is
  dropped so the web page object does not have to carry a query only to pass it to an ignored parameter.
  `WebSearchClient` is not exported, so this is not a public change.

## 4. Data flow (target implementation)

### Image, first page

```
DuckDuckGo.imageSearchPage(query, options?)                                 [NEW]  src/DuckDuckGo.ts
  → createImageSearchSession(query)                                         [REUSE] (token request)
  → ImageSearchSession.searchPage(options?)                                 [NEW]  src/image/ImageSearchSession.ts
      searchOptions = { ...(options ?? {}) }
      → ImageSearchClient.imageSearch(query, token, searchOptions)          [MODIFY] returns SearchResponse
          url = createSearchUrl(query, token, searchOptions)                [REUSE]
          → fetchPage(url, token, searchOptions)                            [NEW public]
              → fetchResults(url, searchOptions)                            [REUSE] (403 → BotChallengeError)
              → ImageSearchParser.parse(text) → SearchResponse(results, raw next)   [MODIFY]
              → createNextPageUrl(raw next, url, token) → absolute URL + vqd        [NEW]
      → new ImageSearchPage(client, token, searchOptions, results, nextUrl) [NEW]
```

`DuckDuckGo.imageSearch` keeps calling `session.search(options)`, which becomes `(await searchPage(options)).results`.
Same single token request and single `i.js` request as today.

### Image, next page

```
ImageSearchPage.fetchNextPage()                                             [NEW]
  if _nextUrl == null → reject Error('DuckDuckGo offers no further page for this search.')
  → ImageSearchClient.fetchPage(_nextUrl, _token, _options)                 [NEW public]
  → new ImageSearchPage(_client, _token, _options, response.results, response.nextUrl)
```

### Web, first page

```
DuckDuckGo.webSearchPage(query, options?)                                   [NEW]
  → WebSearchClient.generateToken(query, options)                           [REUSE] (safe search cookie here)
  → WebSearchClient.webSearch(searchUrl)                                    [MODIFY] drop query; returns SearchResponse
      → DdgHttpClient.get(searchUrl, SEARCH_HEADERS)                        [REUSE] (no options, no cookie)
      → WebSearchParser.parse(text) → SearchResponse(results, raw n)        [MODIFY]
      → nextUrl = raw n == null ? undefined : new URL(raw n, searchUrl).href [NEW]
  → new WebSearchPage(_webSearch, response.results, response.nextUrl)      [NEW]
```

`DuckDuckGo.webSearch` = `(await this.webSearchPage(query, options)).results`.

### Web, next page

```
WebSearchPage.fetchNextPage()                                               [NEW]
  if _nextUrl == null → reject Error('DuckDuckGo offers no further page for this search.')
  → WebSearchClient.webSearch(_nextUrl)
  → new WebSearchPage(_client, response.results, response.nextUrl)
```

### Dependencies

- Token reuse (`ImageSearchSession`, `createImageSearchSession`): merged to `develop`, the base of this branch → reused.
- No other dependency.

### Reusable assets

| Asset | Where | What it does | Reuse |
|---|---|---|---|
| `ImageSearchSession` | `src/image/ImageSearchSession.ts` | Holds client, query, token; `search(options)` runs one `i.js` request | Template for `ImageSearchPage` (stateful object holding the client and token; created with `new` by its owner, exported type-only); gains `searchPage` |
| `DuckDuckGo.createImageSearchSession` | `src/DuckDuckGo.ts` | Mints the vqd, builds the session | `imageSearchPage` calls it, mirroring `imageSearch` |
| `ImageSearchClient.createSearchUrl` | `src/image/ImageSearchClient.ts` | Builds page-1 `i.js` URL | Unchanged |
| `ImageSearchClient.fetchResults` | same | GET with `SEARCH_HEADERS` + options cookie; 403 → `BotChallengeError` | Used for every page |
| `WebSearchClient.generateToken` | `src/web/WebSearchClient.ts` | Scrapes signed page-1 `d.js` URL with safe search cookie | Unchanged |
| `DdgHttpClient.get` | `src/common/DdgHttpClient.ts` | GET + safe search cookie | Unchanged |
| `IDdgWebResult.n` | `src/web/WebSearchParser.ts` | Already declared (`n?: string`), unused | Read by the parser |
| `RecordingHttpClient` | `test/image/ImageSearchSession.test.ts` | Test double recording URLs and options | Pattern for the new offline page specs |

### Genuinely new

- `SearchResponse<TResult>` (internal value object).
- `ImageSearchPage`, `WebSearchPage` (public, type-only exports).
- Next-URL extraction in both parsers; next-URL resolution in both clients.
- `DuckDuckGo.imageSearchPage`, `DuckDuckGo.webSearchPage`, `ImageSearchSession.searchPage`.

## 5. Files to CREATE

| # | File | Content (mirror which existing thing) |
|---|---|---|
| C1 | `src/common/SearchResponse.ts` | Generic value object `SearchResponse<TResult>` with `public readonly results: TResult[]`, `public readonly nextUrl: string \| undefined`. Mirror `WebSearchResult` (constructor parameter properties, JSDoc per property) |
| C2 | `src/image/ImageSearchPage.ts` | Page object, mirror `ImageSearchSession` (constructor-injected `ImageSearchClient`, private token). Spec §7.3 |
| C3 | `src/web/WebSearchPage.ts` | Page object, same shape as C2 for web. Spec §7.5 |
| C4 | `test/common/SearchResponse.test.ts` | Value object spec, mirror `test/image/ImageSearchResult.test.ts` |
| C5 | `test/image/ImageSearchPage.test.ts` | Offline spec with a recording `DdgHttpClient` double, mirror `test/image/ImageSearchSession.test.ts`. §11 |
| C6 | `test/web/WebSearchPage.test.ts` | Offline spec with a recording `DdgHttpClient` double answering `d.js` bodies. §11 |

## 6. Files to MODIFY

| # | File | Change |
|---|---|---|
| M1 | `src/image/ImageSearchParser.ts` | `parse` returns `SearchResponse<ImageSearchResult>`; `IDdgResponse` gains `next?: string`; `nextUrl` = `next` when non-empty, else `undefined`. Challenge handling unchanged. §7.1 |
| M2 | `src/web/WebSearchParser.ts` | `parse` returns `SearchResponse<WebSearchResult>`; while iterating entries, take `n` from the entry carrying it (whether or not that entry also has `t`/`u`); result filtering unchanged. §7.2 |
| M3 | `src/image/ImageSearchClient.ts` | `imageSearch` returns `SearchResponse<ImageSearchResult>` and delegates to new public `fetchPage(url, token, options)`; new private `createNextPageUrl`. §7.3 |
| M4 | `src/image/ImageSearchSession.ts` | New `searchPage(options?)`; `search` returns `(await this.searchPage(options)).results`. §7.4 |
| M5 | `src/web/WebSearchClient.ts` | `webSearch(searchUrl)` (drop unused `query`), returns `SearchResponse<WebSearchResult>` with absolute `nextUrl`. Update its leading comment. §7.5 |
| M6 | `src/DuckDuckGo.ts` | New `imageSearchPage`, `webSearchPage`; `webSearch` delegates to `webSearchPage`; `imageSearch` keeps calling `session.search`. Class JSDoc mentions paging. §7.6 |
| M7 | `src/index.ts` | `export type { default as ImageSearchPage } from './image/ImageSearchPage.ts';` and `export type { default as WebSearchPage } from './web/WebSearchPage.ts';`, mirroring the `ImageSearchSession` line. Keep the existing alphabetical-by-path order |
| M8 | `test/image/ImageSearchParser.test.ts` | Existing assertions read `.results`; add `next` cases. §11 |
| M9 | `test/web/WebSearchParser.test.ts` | Existing assertions read `.results`; assert `nextUrl` from the existing trailing `n` fixture; add a no-`n` case. §11 |
| M10 | `test/image/ImageSearchSession.test.ts` | Existing specs keep passing; add `searchPage` specs. §11 |
| M11 | `test/image/ImageSearchClient.live.test.ts` | The three `client.imageSearch(...)` calls in `describe('imageSearch')` assign to `ImageSearchResult[]`; read `.results` of the returned `SearchResponse` |
| M12 | `test/web/WebSearchClient.live.test.ts` | `client.webSearch(TEST_QUERY, token)` → `client.webSearch(token)`; assertions read `.results` |
| M13 | `test/DuckDuckGo.live.test.ts` | Add live paging specs. §11 |
| M14 | `README.md` | New "Pagination" subsection under "Usage" (after "Image Search Session"): `imageSearchPage`, `webSearchPage`, `session.searchPage`, `hasNextPage` / `fetchNextPage` loop, failure/retry, bot-block warning; mention paging in "Bot Challenges and Blocking" |

## 7. Detailed change specs

### 7.1 `ImageSearchParser.parse` (M1)

```ts
public parse(responseText: string): SearchResponse<ImageSearchResult> {
	const response: IDdgResponse = JSON.parse(responseText) as IDdgResponse;

	if (response.challenge != null) {
		throw new BotChallengeError(response.challenge.cc ?? 'unknown');
	}

	// existing loop building searchResults

	return new SearchResponse(searchResults, this.readNextUrl(response));   // or inline
}

interface IDdgResponse {
	results: IDdgResult[];
	// Relative URL of the next page, without vqd; absent when DDG has no further page.
	next?: string;
	challenge?: IDdgChallenge;
}
```

Treat `next` that is `undefined`, `null` or `''` as no next page (`response.next == null || response.next === ''`).
Update the JSDoc: returns the results and DDG's relative next-page URL.

### 7.2 `WebSearchParser.parse` (M2)

```ts
public parse(responseText: string): SearchResponse<WebSearchResult> {
	const entries: IDdgWebResult[] = this.extractResults(responseText);
	const searchResults: WebSearchResult[] = [];
	let nextUrl: string | undefined;

	for (const entry of entries) {
		if (entry.n != null && entry.n !== '') {
			nextUrl = entry.n;
		}

		if (entry.t == null || entry.u == null) {
			continue;
		}

		searchResults.push(/* unchanged */);
	}

	return new SearchResponse(searchResults, nextUrl);
}
```

Reading `n` before the `t`/`u` filter covers both shapes (standalone trailing entry and `n` on the last real result).
Comment on `IDdgWebResult.n`: relative next-page `d.js` URL with its own signature. Update the class JSDoc to say the
parser also returns the next-page URL.

### 7.3 `ImageSearchClient` (M3) and `ImageSearchPage` (C2)

```ts
// ImageSearchClient
public async imageSearch(
	query: string,
	token: string,
	options?: DdgImageSearchOptions,
): Promise<SearchResponse<ImageSearchResult>> {
	const searchOptions: DdgImageSearchOptions = options ?? {};
	const url: string = this.createSearchUrl(query, token, searchOptions);   // 3 args → one per line

	return this.fetchPage(url, token, searchOptions);                         // 3 args → one per line
}

// Fetches one i.js page. `options` must be the ones of the search's first page: they set the safe search cookie,
// which DDG does not carry in `next`.
public async fetchPage(
	url: string,
	token: string,
	options: DdgImageSearchOptions,
): Promise<SearchResponse<ImageSearchResult>> {
	const responseText: string = await this.fetchResults(url, options);
	const response: SearchResponse<ImageSearchResult> = this._parser.parse(responseText);

	return new SearchResponse(response.results, this.createNextPageUrl(response.nextUrl, url, token));
}

// DDG's `next` is relative to the i.js URL and omits the vqd; the browser appends the same vqd to every page.
private createNextPageUrl(next: string | undefined, pageUrl: string, token: string): string | undefined {
	if (next == null) {
		return undefined;
	}

	const url = new URL(next, pageUrl);
	url.searchParams.set('vqd', token);

	return url.toString();
}
```

Member order: `fetchPage` (public) goes after `imageSearch` and before the private `fetchResults`; `createNextPageUrl`
among the private methods. Update the class JSDoc to mention following `next` with the same vqd.

```ts
// src/image/ImageSearchPage.ts
/**
 * One page of an image search. Immutable: `fetchNextPage` returns a new page and leaves this one unchanged, so a
 * failed request can be repeated by calling it again. Every page reuses the first page's `vqd` token, filters and
 * safe search level.
 */
export default class ImageSearchPage {
	public constructor(
		private readonly _client: ImageSearchClient,
		private readonly _token: string,
		private readonly _options: DdgImageSearchOptions,
		/** The results of this page, in DuckDuckGo's order. */
		public readonly results: ImageSearchResult[],
		private readonly _nextUrl: string | undefined,
	) {}

	/**
	 * Whether DuckDuckGo offers a further page. Answered without a request.
	 */
	public get hasNextPage(): boolean {
		return this._nextUrl != null;
	}

	/**
	 * Fetches the next page with one `i.js` request, reusing this search's token, filters and safe search level.
	 *
	 * @returns The next page; this page is unchanged.
	 * @throws If there is no further page (`hasNextPage` is false). `BotChallengeError` if DuckDuckGo answers with a
	 * bot challenge or HTTP 403 (`reason` `forbidden`). Also throws if the response body cannot be parsed. HTTP errors
	 * are propagated. A failed call can be repeated.
	 */
	public async fetchNextPage(): Promise<ImageSearchPage> {
		if (this._nextUrl == null) {
			throw new Error('DuckDuckGo offers no further page for this search.');
		}

		const response: SearchResponse<ImageSearchResult> = await this._client.fetchPage(
			this._nextUrl,
			this._token,
			this._options
		);

		return new ImageSearchPage(
			this._client,
			this._token,
			this._options,
			response.results,
			response.nextUrl
		);
	}
}
```

`async` makes the "no further page" `throw` a rejection, consistent with every other failure.

### 7.4 `ImageSearchSession` (M4)

```ts
/**
 * Runs an image search for the session's query, reusing its token, and returns its first page.
 * @param options - filters and safe search level for this search and all its further pages.
 * @returns The first page; `fetchNextPage` on it fetches the following pages with the same options.
 * @throws same as `search`.
 */
public async searchPage(options?: DdgImageSearchOptions): Promise<ImageSearchPage> {
	const searchOptions: DdgImageSearchOptions = { ...options };   // frozen copy; caller mutations don't leak in
	const response: SearchResponse<ImageSearchResult> = await this._client.imageSearch(
		this.query,
		this._token,
		searchOptions
	);

	return new ImageSearchPage(
		this._client,
		this._token,
		searchOptions,
		response.results,
		response.nextUrl
	);
}

public async search(options?: DdgImageSearchOptions): Promise<ImageSearchResult[]> {
	const page: ImageSearchPage = await this.searchPage(options);

	return page.results;
}
```

`{ ...undefined }` is `{}`, so the existing `search()` call still produces `f=,,,,,` and `p=1`, and the
`RecordingHttpClient` in `ImageSearchSession.test.ts` records `{}` instead of `undefined` as options. The existing spec
"applies each search its own safe search level on the shared token" asserts `httpClient.options[0]?.safeSearch` equals
`undefined`, which still holds. Creating `ImageSearchPage` with `new` here mirrors `DuckDuckGo` creating
`ImageSearchSession`: the page receives the session's injected client rather than building one.

### 7.5 `WebSearchClient` (M5) and `WebSearchPage` (C3)

```ts
// WebSearchClient
// No cookie here: the level is already in the signed URL, and the browser sends none to links.duckduckgo.com.
// DDG's `n` is relative and signed; resolve it against the fetched URL and never re-encode its query.
public async webSearch(searchUrl: string): Promise<SearchResponse<WebSearchResult>> {
	const responseText: string = await this._httpClient.get(searchUrl, WebSearchClient.SEARCH_HEADERS);
	const response: SearchResponse<WebSearchResult> = this._parser.parse(responseText);
	const nextUrl: string | undefined = response.nextUrl == null
		? undefined
		: new URL(response.nextUrl, searchUrl).href;

	return new SearchResponse(response.results, nextUrl);
}
```

`WebSearchPage` mirrors `ImageSearchPage` with constructor
`(private readonly _client: WebSearchClient, public readonly results: WebSearchResult[], private readonly _nextUrl: string | undefined)`,
the same `hasNextPage` getter and `fetchNextPage()` calling `this._client.webSearch(this._nextUrl)`. Class JSDoc: one
page of a web search, immutable, pages strictly in order, each next URL comes signed from the previous response so the
query and safe search level cannot change. `fetchNextPage` `@throws`: no further page; unreadable results
(`Error('Unable to read results from DuckDuckGo response.')`), HTTP errors propagated; repeatable.

Same headers as page 1 (`SEARCH_HEADERS`) for every page. Do not add a cookie or `options` to page requests.

### 7.6 `DuckDuckGo` (M6)

```ts
/**
 * Runs an image search and returns its first page. `fetchNextPage` on the page fetches further pages on the same
 * token, filters and safe search level, one request each.
 * @param query, options – as imageSearch.  @returns The first page.  @throws as imageSearch.
 */
public async imageSearchPage(query: string, options?: DdgImageSearchOptions): Promise<ImageSearchPage> {
	const session: ImageSearchSession = await this.createImageSearchSession(query);

	return session.searchPage(options);
}

/** Runs a web search and returns its first page … pages strictly in order … */
public async webSearchPage(query: string, options?: DdgSearchOptions): Promise<WebSearchPage> {
	const searchUrl: string = await this._webSearch.generateToken(query, options);
	const response: SearchResponse<WebSearchResult> = await this._webSearch.webSearch(searchUrl);

	return new WebSearchPage(
		this._webSearch,
		response.results,
		response.nextUrl
	);
}

public async webSearch(query: string, options?: DdgSearchOptions): Promise<WebSearchResult[]> {
	const page: WebSearchPage = await this.webSearchPage(query, options);

	return page.results;
}
```

`imageSearch` stays as is (`session.search(options)`). Place `imageSearchPage` after `imageSearch` and
`webSearchPage` after `webSearch`. Extend the class JSDoc: the `*Page` methods return a page whose `fetchNextPage`
pages further. Add `ImageSearchPage` and `WebSearchPage` imports as `import type` where only used as types
(`DuckDuckGo` constructs `WebSearchPage`, so that one is a value import).

## 8. Key technical decisions & risks

1. **Additive API, existing calls untouched.** New `imageSearchPage`, `webSearchPage`, `ImageSearchSession.searchPage`;
   the old methods return `.results` of the same single request. Minor release. Evidence: the old methods' requests are
   unchanged (§7.4, §7.6).
2. **Immutable page objects with `results` / `hasNextPage` / `fetchNextPage()`.** Retry-after-failure, "old pages stay
   valid", and concurrency follow without any state machine. Do not add a mutable cursor (e.g. a `next()` that advances
   an internal position): it breaks retry semantics and makes concurrent calls race.
3. **Two concrete page classes, same shape.** Image and web pages need different state (token + options vs. a signed
   URL), so a shared generic base would only hold `results` and `hasNextPage`. Duplication is two short getters.
4. **Image next page = DDG's `next` + vqd, resolved against the request URL.** Verified live: `next` carries `q`, `p`,
   `f`, `l`, advanced `s`, `u=bing`, no vqd. Do not build page URLs from an offset: `u` and possible future parameters
   would be lost.
5. **Image page requests re-send page 1's options.** `next` has the `p` URL value but not the cookie; without
   options, `Strict` would silently become `Moderate` from page 2. The options are copied at `searchPage` so caller
   mutations cannot change later pages.
6. **Web next URL resolved with `new URL(n, searchUrl).href` and never re-serialised.** Keeps the signed query intact.
7. **Next-URL resolution in the clients, raw extraction in the parsers.** Parsers stay pure body→data translators;
   URL knowledge (vqd, base URL) stays in the clients that already own URL construction.
8. **Calling `fetchNextPage` without a next page rejects** with a plain `Error`; it is a caller error that
   `hasNextPage` lets callers avoid. An empty last page from DDG is returned as a normal (empty) page.
9. **`WebSearchClient.webSearch` loses its unused `query` parameter.** Internal class; touches two live-test calls.

Risks (accepted, outside the package's control): vqd rotation mid-paging may fail image page requests with an
`HttpError` or challenge; `d.js` URL expiry may fail late web page requests; more `i.js` requests bring bot blocks
sooner. All surface as the existing errors; JSDoc and README tell callers.

## 9. Reused as-is (no change)

| Concern | Reuse point | Verified |
|---|---|---|
| Image token | `ImageSearchClient.generateToken`, `DuckDuckGo.createImageSearchSession` | yes |
| Page-1 image URL and filter encoding | `ImageSearchClient.createSearchUrl`, `createImageSearchOptionsHeader`, `OPTION_NAMES` | yes |
| 403 → `BotChallengeError` | `ImageSearchClient.fetchResults` | yes |
| Challenge body → `BotChallengeError` | challenge branch of `ImageSearchParser.parse` | yes |
| Web signed URL scrape + safe search | `WebSearchClient.generateToken`, `SEARCH_URL_REGEX` | yes |
| Body extraction | `WebSearchParser.extractResults`, `findMatchingBracket` | yes |
| HTTP + cookie | `DdgHttpClient.get`, `GlobalSearchOptions.apply` | yes |
| Result value objects | `ImageSearchResult`, `WebSearchResult` | yes |
| Error type | `BotChallengeError` | yes |

## 10. Open questions / VERIFY before coding

All technical; none needs a product decision. None blocks the design: each is absorbed by following DDG's URLs and by
"no `next`/`n` ⇒ no further page".

- **VERIFY (technical): last-page marker.** Is `next` absent, `null` or `''` on the last `i.js` page, and is `n`
  absent on the last `d.js` page? The parsers treat all three as "no further page". Check with a query with few
  results, in a browser or via the new live spec.
- **VERIFY (technical): `d.js` page 2 via `new URL(n, searchUrl).href`.** Confirm the resolved URL returns results
  (signature intact, host `links.duckduckgo.com`). Covered by the new live spec in §11.
- **VERIFY (technical): `i.js` page 2 with `searchParams` re-encoding.** Confirm DDG accepts the re-serialised `next`
  (`q=mountain+landscape`, `f=%2C%2C…`) plus `vqd`. Covered by the new live spec.
- **Open (technical, observation only):** whether `i.js` accepts the previous hour's vqd; whether the response `vqd`
  changes after rotation (do not use it); how long a `d.js` URL stays valid; whether results repeat across pages.
  These affect failure rates, not the code.

## 11. Testing considerations

Run `npm test` (offline) and, deliberately and once, `npm run test:live`; live paging specs add `i.js` requests and can
trigger a block. Follow `testing.md` conventions: `describe` per class and member, Given/When/Then comments,
`NETWORK_TIMEOUT_MS` on live specs, shape-only assertions on live data.

**Offline**

- `SearchResponse.test.ts`: keeps `results` and `nextUrl` (including `undefined`).
- `ImageSearchParser.test.ts`: existing cases read `.results`; `next` present → `nextUrl` equals it verbatim;
  `next` absent and `next: ''` → `nextUrl` undefined; challenge still throws.
- `WebSearchParser.test.ts`: existing fixture → 2 results and `nextUrl === '/d.js?q=lm%20studio&s=10'`; a body
  without any `n` → `nextUrl` undefined; `n` on an entry that also has `t`/`u` → that entry is a result **and**
  supplies `nextUrl`; empty array → no results, no next.
- `ImageSearchPage.test.ts` (recording double answering `{"results":[…],"next":"i.js?q=test&o=json&p=1&s=100&u=bing&f=,size:Large,,,,&l=us-en"}`):
  - `searchPage` → `hasNextPage` true; `fetchNextPage` requests `https://duckduckgo.com/i.js` with `vqd` = session
    token, `s=100`, `u=bing`, `f=,size:Large,,,,`, and passes the first page's options (safe search) to `get`.
  - Last page (body without `next`) → `hasNextPage` false; `fetchNextPage` rejects with the "no further page" error
    and records no request.
  - Failure: double rejects once with `HttpError(500)` then succeeds → first call rejects with that error, the
    original page still has its results and `hasNextPage`, the second call requests the identical URL and resolves.
  - Mutating the caller's options object after `searchPage` does not change the options sent for page 2.
  - 403 on a next page → `BotChallengeError('forbidden')` (mirror `ImageSearchClient.test.ts`).
- `WebSearchPage.test.ts` (recording double answering a `d.js` body with `{"n":"/d.js?q=x&s=10&dp=abc%3D"}`; page 1
  via `WebSearchClient.webSearch('https://links.duckduckgo.com/d.js?q=x&s=0&dp=xyz')`):
  - next request URL is exactly `https://links.duckduckgo.com/d.js?q=x&s=10&dp=abc%3D` (host resolved, encoding
    untouched); no options passed to `get`.
  - no `n` → `hasNextPage` false and rejection without a request; failure-then-retry as for image.
- `ImageSearchSession.test.ts`: existing specs unchanged and passing; `search` still makes exactly one request.

**Live** (`test/DuckDuckGo.live.test.ts`, one spec each, kept minimal to limit bursts)

- `imageSearchPage(TEST_QUERY)` → non-empty results, `hasNextPage` true; `fetchNextPage()` → non-empty results with
  valid URLs.
- `webSearchPage(TEST_QUERY)` → non-empty results, `hasNextPage` true; `fetchNextPage()` → non-empty results with
  titles and valid URLs.
- `WebSearchClient.live.test.ts` and `ImageSearchClient.live.test.ts`: adapt to the `SearchResponse` return.

**Manual:** page a `Strict` image search twice and confirm the second page's request carries the `p=1` cookie (log
in a scratch script); page a few-results query to the end to observe the last-page marker.

## 12. Reference implementation — verified analogous flow

No other implementation of paging exists in this package. Behavioural reference is the browser on duckduckgo.com
(`.claude/documentation/ddg-protocol.md`, "Pagination" under `i.js` and `d.js`): the images tab loads further `i.js`
pages on scroll by following `next` with the same vqd and challenge values; the web tab loads further `d.js` pages by
following `n` from `links.duckduckgo.com`.

Structural neighbour: `ImageSearchSession` (`src/image/ImageSearchSession.ts`, merged from `feature/image-token-reuse`
in `6d0b74d`). Take from it: a stateful object holding an injected `ImageSearchClient` and the token, created with
`new` by its owner, exported type-only from `src/index.ts`, JSDoc'd member by member. Do not copy its option handling:
a session takes options per call, whereas a page fixes them for the whole search.
