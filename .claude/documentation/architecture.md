---
title: "Architecture & Internals"
description: "How ddg-search works inside: the two-layer API/Engine design, the token→search→parse→prioritize→dedupe→cap flow, the DdgSearchOptions encoding, the data models, and the DuckDuckGo protocol quirks."
category: "architecture"
tags: ["architecture", "design", "ddg", "search-strategy", "data-flow", "internals"]
last_updated: "2026-06-20T00:04:08Z"
related_docs: ["overview.md", "code-style.md", "testing.md"]
---

# Architecture & Internals

## Table of Contents
1. [Two Layers](#two-layers)
2. [End-to-End Flow](#end-to-end-flow)
3. [The API Layer: DuckDuckGoApi](#the-api-layer-duckduckgoapi)
   - [Token Generation](#token-generation)
   - [Image Search and Option Encoding](#image-search-and-option-encoding)
4. [The Engine Layer: Prioritized Search](#the-engine-layer-prioritized-search)
5. [Data Models](#data-models)
6. [DuckDuckGo Protocol Quirks](#duckduckgo-protocol-quirks)
7. [Error Handling](#error-handling)

---

## Two Layers

The library is two cooperating classes with a clear seam:

| Layer | Class | Responsibility | Returns |
|-------|-------|----------------|---------|
| API (low-level) | `DuckDuckGoApi` | Talk to DDG: get a token, GET `i.js`, encode options | **raw JSON string** |
| Engine (high-level) | `DuckDuckGoImageSearch` | Run a multi-query strategy, parse, prioritize, dedupe, cap | `ImageSearchResult[]` |

The engine **owns an instance of the API** (`private readonly _api = new
DuckDuckGoApi()`) and is the only caller of it in this package. `DuckDuckGoApi`
knows nothing about prioritization; `DuckDuckGoImageSearch` knows nothing
about URLs or headers. This split is the core design decision: the brittle,
DDG-specific transport is isolated in one class so the strategy layer stays
pure data manipulation.

## End-to-End Flow

`engine.search(query)` performs:

```
generateToken(query)                     1 HTTP GET → vqd token
  └─ for each of 4 prioritized option sets (sequentially):
       imageSearch(query, token, options)   1 HTTP GET → raw JSON
       parseResponse(json)                  → ImageSearchResult[]
       tag each result with priority = optionBasePriority + index
  merge all tagged results
  sort ascending by priority
  walk sorted list, dedupe by imageUrl, stop at 100
  → ImageSearchResult[]
```

So a single `search()` makes **1 + 4 = 5 sequential HTTP requests** against
live DuckDuckGo. They run in order, not in parallel; a failure in any one
rejects the whole call (see [Error Handling](#error-handling)).

## The API Layer: DuckDuckGoApi

`src/DuckDuckGoApi.ts`. A thin, stateless client. All its
fields are `private readonly` constants (headers, the option-name order, the
token regex). It exposes two public methods and keeps URL construction private.

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
`user-agent`, `x-requested-with: XMLHttpRequest`, `referer`, etc.) and returns
the response body verbatim as a string — it does **not** parse JSON. Parsing is
the engine's job.

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

## The Engine Layer: Prioritized Search

`src/image/DuckDuckGoImageSearch.ts`. The engine runs the
same query four times with progressively looser filters and ranks results by
how well they matched the preferred (tight) filter.

The strategy table:

```ts
private readonly SEARCH_OPTIONS: PrioritizedSearchOption[] = [
  { options: { size: 'Large', layout: 'Square' }, priority: 0 },
  { options: { layout: 'Square' },                priority: 5 },
  { options: { size: 'Large' },                   priority: 10 },
  { options: {},                                  priority: 20 }
];
```

Lower `priority` is better. For each option set, every returned result is
tagged with `priority = base + indexInThatResponse`, so the first result of the
tightest search (base 0) ranks above the second (1), and the entire
`Large+Square` batch (0–4, since priorities are spaced 5 apart) ranks above the
`Square-only` batch (5+), and so on. The spacing of 5/10/20 leaves room for
the per-result index without batches overtaking each other at the boundaries.

After collecting all tagged results, the engine:

1. **Sorts** ascending by priority (`a.priority - b.priority`).
2. **Dedupes** by `imageUrl` using a `Map<string, ImageSearchResult>` — first
   (best-priority) occurrence wins, later duplicates are skipped.
3. **Caps** at 100: the dedupe loop breaks once the map reaches 100 entries.

The result is the map's values: up to 100 unique images, best matches first.

> **Note — domain bias.** The `Large/Square` preference is a carry-over from the
> library's origin as album-artwork search. It is a sensible default but is
> hard-coded; a more general image library might expose the strategy to the
> caller. (Recorded in `.claude/tasks/standalone-ddg-package.md`.)

`parseResponse` casts the parsed JSON to `{ results: { image, thumbnail }[] }`
and maps each entry to `new ImageSearchResult(thumbnail, image)`. The internal
shapes `PrioritizedSearchOption`, `PrioritizedResult`, `DdgResponse`, and
`DdgResult` are `interface`s, not classes — partly because the project enforces
`max-classes-per-file: 1` (see [code-style.md](code-style.md#one-class-per-file)).

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
`thumbnailUrl, imageUrl`** but the engine maps from DDG's `{ image, thumbnail }`
— `new ImageSearchResult(result.thumbnail, result.image)`. Keep that mapping
straight when touching either side.

**The high-level engine is not part of the public surface.** `src/index.ts`
re-exports only `DuckDuckGoApi`, `ImageSearchResult`, and the `Ddg*` types —
`DuckDuckGoImageSearch` lives in the source tree but is not exported from the
barrel (see [overview.md](overview.md#public-api)). The earlier
`IImageSearchEngine` interface that the engine implemented has been removed;
there is no engine interface anymore.

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
- **Transport.** Responses are gzip/deflate/br-compressed and chunked. The
  `HttpResponseReader` from `node-http-toolkit` handles buffering and
  decompression; the request goes through `AsyncResolvingHttpRequest`, which
  follows redirects and rejects on HTTP ≥ 400.

## Error Handling

The package **fails fast** and throws rather than logging or swallowing:

- `generateToken` throws `Error('Unable to read token from DuckDuckGo
  response.')` when the regex finds no `vqd`.
- HTTP-level failures (status ≥ 400, network errors, timeouts) reject from the
  underlying `node-http-toolkit` request and propagate.
- In the engine, the four sub-searches run sequentially with no try/catch, so a
  failure in any one **aborts the whole `search()`** — partial results are not
  returned. This is a deliberate behavior choice (the engine previously
  swallowed per-option failures via a logger; that was removed). If you need
  resilience to one bad sub-query, that has to be added explicitly.
