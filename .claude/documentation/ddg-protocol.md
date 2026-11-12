---
title: "DuckDuckGo Search Protocol"
description: "Reference for DuckDuckGo's undocumented search protocol as observed from browsers: the results page, the vqd token and its rotation, image search (i.js), web search (d.js), pagination, safe search, region, bot detection and browser request profiles, each claim labelled with its evidence and how to re-check it."
category: "reference"
tags: ["ddg", "protocol", "vqd", "i.js", "d.js", "safe-search", "pagination", "bot-challenge", "headers"]
last_updated: "2026-11-12T18:03:30Z"
related_docs: ["architecture.md", "testing.md"]
---

# DuckDuckGo Search Protocol

## Table of Contents

1. [Scope and Evidence](#scope-and-evidence)
2. [Overview](#overview)
3. [The vqd Token](#the-vqd-token)
4. [Results Page](#results-page)
5. [Image Search: i.js](#image-search-ijs)
6. [Web Search: d.js](#web-search-djs)
7. [Safe Search](#safe-search)
8. [Region and Locale](#region-and-locale)
9. [Bot Detection](#bot-detection)
10. [Browser Request Profiles](#browser-request-profiles)
11. [Open Questions](#open-questions)

---

## Scope and Evidence

This describes DuckDuckGo, not this package; [architecture.md](architecture.md) maps the package onto it. DDG
publishes none of this and changes it without notice, so every claim carries a label and the date it was last seen:

- **[verified]**: tested directly, including the variations that could break it.
- **[observed]**: seen consistently, but not tested in isolation.
- **[unknown]**: open; listed again under [Open Questions](#open-questions).

All observations come from Firefox 159/160 and Safari 27.2 browser sessions on macOS between 2026-11-10 and
2026-11-12, from Germany and through a Turkish VPN. Times are UTC. **Re-check** lines say how to confirm a claim in a
browser: open the developer tools' network tab, then search.

## Overview

```
GET duckduckgo.com/?q=<query>...            results page (HTML)
  │ embeds: vqd, signed d.js URL, __sc__ challenge
  ├─► GET duckduckgo.com/i.js?...&vqd=...   image results (JSON), next page: same vqd + offset
  ├─► GET links.duckduckgo.com/d.js?...     web results (JS), next page: signed URL from the response
  └─► GET duckduckgo.com/qna.js?...&vqd=... Q&A panel; carries the same vqd
```

The browser loads the results page once per query and per safe search change. Switching between the web and image
tabs, and turning pages, happen in page JavaScript without a new page load **[observed 2026-11-12]**.

## The vqd Token

A query-scoped token, formatted `4-` followed by about 39 digits. `i.js` requires it; it is also embedded in every
`d.js` URL and sent to `qna.js`.

**Where it appears**

- Page source: `vqd="4-…"`, plus inside the embedded `d.js` URL.
- Request parameter `vqd` on `i.js`, `d.js` and `qna.js`.
- `i.js` response body: `"vqd": {"<url-encoded query>": "4-…"}`.

**What determines it: the query and the UTC hour, nothing else** **[verified 2026-11-12]**

The same query within the same UTC hour returns the same vqd regardless of:

- search type (web page, images page, `qna.js`);
- safe search level, and the safe search cookie;
- region setting (`l` and `ah` cookies);
- cookies or browser session (a fresh private window gets the same value);
- IP address and country (Germany and Turkey gave the same value);
- client (Firefox and Safari gave the same value).

Re-check: load one query in two different browsers within one UTC hour and compare `vqd=` in the page source.

**Rotation on the full UTC hour** **[observed 2026-11-12]**

Five rotations, each inside a window containing a full hour, the tightest between 10:59:00 and 11:01:01. No two loads
within one hour ever differed (more than 20 page loads, three queries). One vqd lived from at most 10:04 until the boundary, which
rules out a fixed lifetime of about an hour. The digits after a common query-specific prefix grow with each rotation
(`4-265079412…`, `4-265079776…`, `4-265079982…`, `4-265080346…`), consistent with an hour component.

Re-check: load a query a minute before and a minute after a full hour.

**Unknown:** whether `i.js` still accepts the previous hour's vqd, and whether the `vqd` field in an `i.js` response
returns the new value after a rotation.

## Results Page

`GET https://duckduckgo.com/?q=<query>&t=h_` loads the web tab; adding `iar=images` loads the images tab. Other
parameters (`ia=web`, `iax=images`, `ia=images`, `atb=…`, `origin`, `we_*`) don't change what the tokens are
**[observed 2026-11-12]**. HTML, brotli-encoded in browsers.

**Embedded values**

| Value | Form | Changes |
|---|---|---|
| `vqd="4-…"` | JS variable | per query and UTC hour |
| `DDG.deep.initialize('<d.js URL>')` | absolute `https://links.duckduckgo.com/d.js?…` on the web tab, relative `/d.js?…` on the images tab | per page load; signs the safe search level and region in force |
| `window.__sc__={ h:'…', d:'…' }` | base64 challenge hash and signed blob | per page load |
| `rl="us-en"`, `ct` | locale and country of the request | with region setting and IP |

Both tab variants work for both search types: the `d.js` URL from the images page returns web results
**[verified 2026-11-12]**.

## Image Search: i.js

`GET https://duckduckgo.com/i.js?…`, response `content-type: application/x-javascript` with a JSON body.

**Parameters**

| Name | Example | Purpose | Set by |
|---|---|---|---|
| `o` | `json` | response format | client |
| `q` | `palm tree` | query; must match the vqd's query | client |
| `vqd` | `4-…` | token from the page | page |
| `l` | `us-en` | locale; `de-de` with region Germany | client |
| `p` | `1` | safe search ([table](#safe-search)) | client |
| `f` | `,size:Large,,,layout:Square,` | filters, positional: `time,size,color,type,layout,license`; the browser omits it without filters | client |
| `s` | `100` | result offset for pages after the first | from `next` |
| `u` | `bing` | backend; appears from page 2 on | from `next` |
| `ct` | `DE`, `TR` | country derived from IP | page |
| `jsa`, `jsa_hash`, `dp` | base64 | challenge answer ([Bot Detection](#bot-detection)) | page script |
| `bpia`, `a`, `journey_id`, `*exp` | | telemetry and experiment flags | page script |

**Response**

```json
{
  "results": [{ "image": "…", "thumbnail": "…", "title": "…", "url": "…", "width": 1280, "height": 1920,
                "source": "Bing", "image_token": "…", "thumbnail_token": "…", "encoding_format": "jpeg",
                "discovery_date": "…" }],
  "next": "i.js?q=palm%20tree&o=json&p=1&s=100&u=bing&l=us-en&ct=TR",
  "vqd": { "palm%20tree": "4-…" },
  "query": "palm tree", "queryEncoded": "…", "query_expansions": "…", "response_type": "images", "ads": null
}
```

70 to 100 results per page **[observed 2026-11-12]**. A blocked request returns `challenge` instead of `results`
([Bot Detection](#bot-detection)).

**Pagination** **[observed 2026-11-12]**

`next` is a relative URL with `s` advanced by 100 (`100`, `200`, `300`) and `u=bing`. It carries no vqd and no
signature: the browser appends the same vqd and `__sc__` values for every page, so a client can build page URLs itself.
**Unknown:** whether `next` keeps `f` when filters are set.

Re-check: scroll the images tab and compare consecutive `i.js` requests.

## Web Search: d.js

`GET https://links.duckduckgo.com/d.js?…`, response `content-type: application/x-javascript`. The browser loads it as a
`<script>` and sends no cookies to `links.duckduckgo.com`.

**The URL can't be built** **[verified 2026-11-12]**

It carries a `dp` signature that changes with the parameters: the web-tab URL, the images-tab URL, each safe search
level and each result page all get a different `dp` for the same query and vqd. Only the page (first page) or the
previous `d.js` response (later pages) supplies a valid URL. Re-check: compare `dp` across two pages of one search.

**Parameters**

| Name | Example | Purpose |
|---|---|---|
| `q` | `palm tree` | query |
| `vqd` | `4-…` | same vqd as the page |
| `s` | `0` | result offset |
| `l`, `dl`, `bing_market` | `us-en`, `en`, `en-US` | locale; `de-de` / `de-DE` with region Germany |
| `ct` | `TR` | country derived from IP |
| `ex` or `p` | `-1` | safe search ([table](#safe-search)) |
| `dp` | base64 | signature over the URL |
| `t`, `a`, `sp`, `p_ent`, `host_region`, `perf_*`, `journey_id`, `*exp`, `wpa`, `wpl`, `dfrsp`, `wrap`, `aps` | | source, telemetry and experiment flags; carried along as given |

**Response**

JavaScript that calls `DDG.pageLayout.load('d', [ … ])` with an array of results:

| Field | Meaning |
|---|---|
| `t` | title |
| `u` | URL |
| `a` | snippet, HTML with `<b>` highlights |
| `d`, `i`, `sn`, `c` | display URL, host, site name, canonical URL |
| `n` | on the last entry only: the next page's `d.js` URL, relative, with its own `dp` |

**Pagination** **[observed 2026-11-12]**

Follow `n`. Offsets are uneven (`0`, `10`, `25`, `40`) and every page has a new `dp`, so pages must be fetched in
order. **Unknown:** how long a `d.js` URL stays valid.

## Safe Search

| Level | `p` cookie on `duckduckgo.com` | `i.js` `p` | `d.js` URL |
|---|---|---|---|
| Off | `p=-2` | `-1` | `ex=-2` |
| Moderate (default) | none | `1` | `ex=-1` |
| Strict | `p=1` | `1` | `p=1`, no `ex` |

**[verified 2026-11-12]**

- `i.js` carries the level twice, as `p` and as the cookie. Moderate and Strict share `p=1`; only the cookie tells
  them apart (one query gave 91 results under Moderate and 70 under Strict).
- Changing the level in the browser reloads the page. The vqd stays the same; the `d.js` URL gets a new `dp`
  because the level is signed into it.
- One vqd serves `i.js` at every level: the browser sent `p=1` and `p=-1` with the same vqd.

Re-check: switch the safe search setting and compare the page's cookie, `i.js` `p` and `d.js` `ex`.

## Region and Locale

**[verified 2026-11-12]**

- The region toggle sets cookies `l=<region>` and `ah=<region>` (e.g. `de-de`); turning it off sets `l=wt-wt` and
  leaves `ah`.
- With a region, `i.js` and `d.js` carry `l=de-de` and `d.js` `bing_market=de-DE`; without one, `l=us-en` and
  `bing_market=en-US`.
- `ct` is the country derived from the IP address (`DE`, `TR`), independent of the region setting.
- None of these affect the vqd.

## Bot Detection

**The challenge** **[observed 2026-11-12]**

The results page embeds `window.__sc__ = { h, d }`: `h` is a base64 JSON hash (`{"h":"…","v":1}`), `d` a signed blob.
An obfuscated page script computes an answer from them (`jsa`, base64 `{"v":1,"h":<number>}`). The browser sends
`jsa`, `jsa_hash` (= `h`) and `dp` (= `d`) with every `i.js` request, reusing one page's values across all
`i.js` pages until the next page load. `__sc__` changes with every page load. `d.js` requests carry no challenge values.

**Blocks** **[observed by 2026-11-09 with this package's Node client; 2026-11-11 with curl]**

Clients that send no challenge values are tolerated for a burst of `i.js` requests, then blocked, usually for some
time. A block takes one of these forms:

| Form | Seen from |
|---|---|
| JSON body `{"challenge": {"cc": "<category>", …}}` instead of `results`, HTTP 200; `cc` e.g. `botnet` | Node client |
| plain-text body, HTTP 403 | Node client |
| same `challenge` JSON with HTTP 202, `cc: "sre"`, for every request including a fresh vqd | curl through a proxy |
| `d.js` HTTP 202 with an obfuscated `window.execDeep` script instead of results | curl through a proxy |

The curl rows come from a client that differs from browsers in protocol, TLS stack and headers; they show that
`d.js` can be gated too, not that it is for other clients. **Unknown:** whether results-page requests count towards a
block.

## Browser Request Profiles

Firefox 160 on macOS, HTTP/2, headers in sending order **[observed 2026-11-12]**. HTTP/2 sends header names in lower
case; `Connection` and `TE` are listed as the developer tools report them. A client imitating Firefox should track the
current release.

| Header | Results page | `i.js` | `d.js` |
|---|---|---|---|
| `Host` | `duckduckgo.com` | `duckduckgo.com` | `links.duckduckgo.com` |
| `User-Agent` | `Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:160.0) Gecko/20100101 Firefox/160.0` | same | same |
| `Accept` | `text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8` | `*/*` | `*/*` |
| `Accept-Language` | `en-US,en;q=0.9` (plus the user's other languages) | same | same |
| `Accept-Encoding` | `gzip, deflate, br, zstd` | same | same |
| `Referer` | `https://duckduckgo.com/` when navigating from DDG | `https://duckduckgo.com/` | `https://duckduckgo.com/` |
| `DNT`, `Sec-GPC` | `1`, `1` (privacy settings) | same | same |
| `Connection` | `keep-alive` | same | same |
| `Cookie` | safe search and region cookies | same | none |
| `Upgrade-Insecure-Requests` | `1` | — | — |
| `Sec-Fetch-Dest` | `document` | `empty` | `script` |
| `Sec-Fetch-Mode` | `navigate` | `cors` | `no-cors` |
| `Sec-Fetch-Site` | `none` when typed, `same-origin` from DDG | `same-origin` | `same-site` |
| `Sec-Fetch-User` | `?1` | — | — |
| `Priority` | `u=0, i` | `u=4` | `u=1` on the first page; absent on pages from `n` |
| `TE` | `trailers` on some requests | same | same |

## Open Questions

| Question | How to answer |
|---|---|
| Does `i.js` accept the previous hour's vqd? | Send one `i.js` request with a vqd from the previous UTC hour, from a non-browser client |
| Does the `vqd` field in an `i.js` response change after a rotation? | Page through image results across a full UTC hour |
| Does `i.js` `next` keep `f` when filters are set? | Page a filtered image search |
| How long does a `d.js` URL stay valid? | Fetch a scraped `d.js` URL again after increasing delays |
| Do results-page requests count towards a block? | Compare block onset with and without extra page loads between `i.js` requests |
| Exact rotation instant | Load a query every few seconds around a full UTC hour |
