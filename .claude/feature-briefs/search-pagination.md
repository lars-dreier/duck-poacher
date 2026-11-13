# Search pagination: page through image and web results

## Goal & context

- duck-poacher returns only the first page of results for both image search and web search, although DuckDuckGo
  pages both endpoints. This work lets a caller request the following pages of a search on demand, for image and web
  search alike, so a search can return more than DDG's first page (70 to 100 images, about 10 to 15 web results).
- Work item: plain feature request ("the package should support the pagination ddg already provides"), branch
  `feature/pagination`. No tracker ticket and no written spec; the spec below is the user's answers during the
  investigation of 2026-11-13.
- Scope: the whole feature and this slice coincide. Pagination for both image and web search, consumed page by page
  through the live search object. Persisted cursors and automatic multi-page fetching are excluded (see Out of scope).

## Spec (authoritative, from the user's answers, 2026-11-13)

Flow:

1. The caller runs an image search (directly or through an image search session) or a web search.
2. The caller receives the first page of results together with a way to request the next page.
3. The caller requests the next page whenever it wants; each request fetches exactly one further page from DDG and
   yields that page's results and, again, a way to request the page after it.
4. The caller stops whenever it wants, or when DDG has no further page.

Acceptance criteria:

- Image search and web search both support requesting further pages.
- Further pages are fetched only on explicit request; the package never fetches ahead or fetches several pages at once.
- The consumption model is the same for image and web search.
- A failed page request propagates the error as searches do today. Afterwards the caller can request the same page
  again, and pages already received stay valid.
- The pagination position lives only in the in-memory object the caller holds; it does not need to be serializable or
  resumable in another process.
- Existing calls (`DuckDuckGo.imageSearch`, `DuckDuckGo.webSearch`, `ImageSearchSession.search`) keep their current
  return types and behaviour if that is possible without compromising code quality. Changing them is allowed only as a
  last resort and then means a breaking (major) release.

## Technical requirements

### Contracts & dependencies

Source: [ddg-protocol.md](../documentation/ddg-protocol.md), observed from browsers 2026-11-12, and the current code.
DDG documents none of this.

**Image search, `GET https://duckduckgo.com/i.js`**

- Request parameters today: `l`, `o=json`, `q`, `vqd`, `f` (positional filters), `p` (safe search level), plus the safe
  search `p` cookie. No offset is sent, so DDG returns page 1.
- The JSON response carries `next`, a relative URL such as `i.js?q=palm%20tree&o=json&p=1&s=100&u=bing&l=us-en&ct=TR`.
  It advances `s` by 100 per page (`100`, `200`, `300`) and adds `u=bing` from page 2 on [observed].
- `next` carries **no** vqd and **no** signature. The browser appends the same vqd (and its challenge values) to every
  page, so a client can build page URLs itself [observed].
- The response also carries `vqd: { "<encoded query>": "4-…" }`. The package ignores it today.
- Safe search: `Moderate` and `Strict` share `p=1` and differ only by the cookie, so every page request must carry the
  same cookie and `p` as page 1, or later pages silently change level [verified for page 1].
- The parsed result type stays `ImageSearchResult` (`thumbnailUrl`, `imageUrl`); pages add no new fields.

**Web search, `GET https://links.duckduckgo.com/d.js`**

- Page 1 is the signed URL scraped from the results page. Its `dp` signature covers every parameter, including offset
  and safe search level, so **page URLs cannot be built client-side** [verified].
- The response's result array ends with an entry carrying `n`: the next page's `d.js` URL, relative (e.g.
  `/d.js?q=…&s=10…`), with its own `dp` [observed]. In the parser test fixture this is a standalone trailing entry
  without title or URL, which the package drops today.
- Offsets are uneven (`0`, `10`, `25`, `40`), and each page's URL exists only in the previous response, so web pages
  can only be fetched strictly in order [observed].
- Safe search is signed into the URL when page 1 is scraped. Later pages inherit it through their signed URLs; no
  cookie is sent to `links.duckduckgo.com` [verified for page 1].
- The parsed result type stays `WebSearchResult` (`title`, `url`, `description`).

**Effects outside the package's control**

- **vqd rotation.** The vqd rotates on the full UTC hour. Whether `i.js` accepts the previous hour's vqd is unknown, so
  image paging that crosses an hour boundary may fail. `ImageSearchSession` already carries this risk today.
- **d.js URL lifetime.** How long a scraped `d.js` URL (including an `n` URL) stays valid is unknown.
- **Bot blocking.** Every image page is one more `i.js` request without challenge values, counting towards the burst
  after which DDG blocks the client (`BotChallengeError`). Paging makes blocks more likely. `d.js` has been seen gated
  too (HTTP 202 with an obfuscated script), but only from curl through a proxy.

### Behaviour requirements

- **Page content.** Each requested page yields that page's results in DDG's order, parsed exactly as page 1 is today.
  The pagination entry (`n`) never appears as a result.
- **Same search on every page.** All pages of a search use page 1's query, image filters and safe search level. A
  caller cannot change filters or level partway through a pagination sequence; a different filter or level is a new
  search. (For web this is forced by the signature; for image it keeps the result set coherent and the cookie/`p` pair
  consistent.)
- **End of results.** The caller can tell, without making a request, whether a further page is available. When DDG
  supplies no next page (no `next` for image, no `n` for web), none is offered. What DDG sends on the last page is
  unverified (see Open questions); an empty page from DDG is returned as an empty page, not as an error.
- **In-flight.** Each page request is one awaited call making one HTTP request, with no token request: image pages
  reuse page 1's vqd, web pages use the URL from the previous response.
- **Failure.** A page request fails with the same errors as page 1 today: `BotChallengeError` for an `i.js` challenge
  body or HTTP 403, `Error('Unable to read results from DuckDuckGo response.')` for an unreadable `d.js` body,
  `HttpError` for other HTTP statuses, and network rejections. A failure does not advance the position: requesting the
  next page again repeats the failed request, and previously returned pages are unaffected.
- **Existing calls.** `imageSearch`, `webSearch` and `ImageSearchSession.search` keep returning the first page's
  results as a plain array, unless keeping them unchanged would compromise code quality (see Spec).
- **Public types.** Any new public type is exported from the `src/index.ts` barrel, like the existing public API.

### Constraints

- Web pages are strictly sequential: no random access to page N, and no building of page URLs.
- Image pages are 70 to 100 results; web pages roughly 10 to 15. Neither size is controllable by the client.
- The package sends no bot-challenge answers, so long image paging runs into `BotChallengeError`. Pagination does not
  try to solve or evade the challenge.
- No request timeout is configured; a stalled page request can hang like any request today.

## Out of scope (for this slice)

- Serializable or resumable cursors (continuing a search in another process or request).
- Fetching several pages in one call, a "desired result count" option, or async iteration over results.
- Random access to a page by number.
- Re-minting an expired vqd when paging crosses a UTC hour.
- Detecting a `d.js` bot gate (HTTP 202 with `window.execDeep`) as `BotChallengeError`; it keeps surfacing as the
  generic unreadable-results error.
- Deduplicating results that may repeat across pages.

## Reference implementation (example, not a template)

- None in this package. The browser's own behaviour on duckduckgo.com is the behavioural reference: the images tab
  loads further `i.js` pages on scroll with the same vqd, the web tab loads further `d.js` pages by following `n`
  ([ddg-protocol.md](../documentation/ddg-protocol.md), "Pagination" under i.js and d.js).
- `ImageSearchSession` (`src/image/ImageSearchSession.ts`, branch merged as `feature/image-token-reuse`) shows how the
  package exposes a stateful object holding a vqd. It reuses the token across searches with different options; paging
  instead fixes the options, so it is a behavioural neighbour, not a model to copy.

## Open questions

Open — product: none.

Open — technical (requirement-level; verify during implementation):

- Does `i.js` `next` keep `f` when filters are set, or must filters be re-applied to later pages? Answer by paging a
  filtered image search. Determines whether later image pages stay filtered.
- What marks the last page: is `next` absent or empty on the last `i.js` page, and is `n` absent on the last `d.js`
  page? Answer with a query that has few results.
- Does `i.js` require `u=bing` (or other parameters from `next`) on later pages, or is advancing `s` enough?
- Does the `vqd` field in an `i.js` response change across pages or after an hour rotation, and should later pages use
  it? Does `i.js` accept the previous hour's vqd?
- How long does a `d.js` `n` URL stay valid? Determines whether a caller pausing between web pages gets an error.
- Do pages overlap (repeated results across pages)?
- Which host does the relative `n` URL resolve against (`links.duckduckgo.com`, like page 1)?

## Deferred to technical overview

- Shape of the paged result: what object carries a page's results and the next-page capability, for image and web.
- Whether the existing calls stay unchanged with pagination added alongside, or change their return type.
- Where the image pagination position (vqd, offset, options) and the web next URL are held.
- Whether the image next page is built from `next` or from the offset directly.
- How the parsers expose `next` / `n` alongside the results.
- How concurrent requests for the next page on the same object behave.
