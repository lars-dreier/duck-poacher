---
title: "Testing Guide"
description: "How the test suite is structured and run: the node:test runner via tsx, live integration tests against the real DuckDuckGo API (image and web search), the offline parser/value-object specs, shared fixtures, and conventions."
category: "guide"
tags: ["testing", "node-test", "tsx", "integration", "live-api", "conventions"]
last_updated: "2026-06-21T10:00:32Z"
related_docs: ["development.md", "architecture.md", "code-style.md", "overview.md"]
---

# Testing Guide

## Table of Contents
1. [Runner and Setup](#runner-and-setup)
2. [Running Tests](#running-tests)
3. [Live Integration Tests](#live-integration-tests)
4. [Test Layout](#test-layout)
5. [Shared Fixtures](#shared-fixtures)
6. [Conventions](#conventions)
7. [Type-Checking the Test Tree](#type-checking-the-test-tree)

---

## Runner and Setup

Tests use the **built-in `node:test` runner** with `node:assert/strict`,
executed through **tsx** so TypeScript runs without a separate compile step.
There is no Jest, Vitest, Mocha, or assertion library.

```ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
```

## Running Tests

| Command | Purpose |
|---------|---------|
| `npm test` | Run all `test/**/*.test.ts` once |
| `npm run test:coverage` | Run with `--experimental-test-coverage` |
| `npm run test:watch` | Re-run on change |

The underlying invocation is `tsx --test "test/**/*.test.ts"`.

## Live Integration Tests

This package is a scraper over DuckDuckGo's undocumented image and web search
endpoints, so the tests that matter **hit the real DDG API** rather than mocking it.
There is no local HTTP server, no recorded fixture for the network layer, and no test
double for it — those would only prove the code calls itself, not that it still works
against a live, drifting target. The `DuckDuckGo`, `ImageSearchClient`, and
`WebSearchClient` specs are the live-network validation; the parser and value-object
specs run offline.

Consequences to keep in mind:

- **Network is required for the API specs.** `DuckDuckGo.test.ts` (both its
  `imageSearch` and `webSearch` branches), `ImageSearchClient.test.ts`, and
  `WebSearchClient.test.ts` hit the live DuckDuckGo API and fail without connectivity.
  The offline specs — `ImageSearchParser.test.ts`, `ImageSearchResult.test.ts`, and
  `WebSearchParser.test.ts` — run without the network and validate pure parsing.
- **DDG can break the live specs.** DDG changes its `vqd` token format, the signed
  `d.js` search URL, the `i.js` and `d.js` response shapes, headers it accepts, and its
  transport (responses are chunked and gzip/deflate/br-compressed). A failure here
  usually means DDG changed, not that the test is flaky — investigate the real response
  before "fixing" the test. The API issues its GETs through `node-http-toolkit`'s
  `AsyncResolvingHttpRequest` (follows redirects, rejects on HTTP ≥ 400) and
  buffers/decompresses the body with `HttpResponseReader`
  ([architecture.md](architecture.md#duckduckgo-protocol-quirks)).
- **Assert on shape, not content.** Specs assert that an image token matches `/^[\d-]+$/`,
  that a web search URL points at `links.duckduckgo.com/d.js`, that searches return a
  non-empty array, and that every result's URLs are absolute http(s) URLs — never on
  specific results, which change constantly.
- **Generous timeouts.** Each live `it` carries an explicit `NETWORK_TIMEOUT_MS`
  timeout (30,000 ms). The specs that search first generate a token, so they make two
  sequential requests within that budget. The offline specs need no timeout.

## Test Layout

`test/` mirrors `src/`. Each source file has a sibling spec under the matching folder:

```
test/
  TestHelper.ts                              shared fixtures (not a spec)
  DuckDuckGo.test.ts                         live: public facade → imageSearch & webSearch
  image/
    ImageSearchClient.test.ts                live: image token generation + search
    ImageSearchParser.test.ts                offline: JSON-string → ImageSearchResult mapping
    ImageSearchResult.test.ts                offline: value object
  web/
    WebSearchClient.test.ts                  live: web search-URL generation + search
    WebSearchParser.test.ts                  offline: d.js string → WebSearchResult mapping
```

Specs end in `.test.ts`; support files (shared fixtures) do not, so the glob skips them.
The public facade `DuckDuckGo` test exercises both search types via one
`describe('DuckDuckGo')` suite with nested `describe('imageSearch')` and
`describe('webSearch')` blocks.

## Shared Fixtures

`test/TestHelper.ts` holds the fixtures shared across the live specs — prefer it over
hand-rolling values in each test:

- `TEST_QUERY` — a stable, result-rich query (`'mountain landscape'`) so both image and
  web searches return reliably non-empty results across runs.
- `NETWORK_TIMEOUT_MS` — the per-request budget (`30_000` ms) passed as the `it` timeout
  option.
- `assertHttpUrl(value, label)` — asserts a value is a non-empty absolute http(s) URL
  (regex: `/^https?:\/\//`), used to validate every returned image URL, thumbnail URL,
  and web result URL.

These are plain fixtures and assertions, not resources — there is nothing to tear down,
so no `afterEach` cleanup is needed and none of the specs register one. The offline
parser specs build their own fixtures inline rather than calling the network:
`ImageSearchParser.test.ts` uses a `JSON.stringify`'d `{ results: [...] }`, and
`WebSearchParser.test.ts` uses a string embedding the `DDG.pageLayout.load('d', [...])`
marker the parser scans for.

## Conventions

- **Structure:** `describe` per class with a nested `describe` per method, and an `it`
  per behavior (e.g. `describe('DuckDuckGo')` → `describe('imageSearch')` → `it(...)`;
  `describe('WebSearchClient')` → `describe('generateToken')` → `it(...)`).
- **Given/When/Then:** each `it` body carries `// Given`, `// When`, `// Then` comments
  narrating the scenario. Follow this — it is consistent across the suite.
- **Network timeout:** pass `{ timeout: NETWORK_TIMEOUT_MS }` as the `it` options
  argument on any spec that makes a request (all of `DuckDuckGo.test.ts`,
  `ImageSearchClient.test.ts`, and `WebSearchClient.test.ts`); omit it on the offline
  specs (`ImageSearchParser.test.ts`, `ImageSearchResult.test.ts`, `WebSearchParser.test.ts`).
- **Shape assertions:** use `assert.match` for tokens and URLs (`/^[\d-]+$/` for the
  image vqd, a `links.duckduckgo.com/d.js` match for the web search URL), `assertHttpUrl`
  for returned result URLs, and `assert.ok`/`assert.equal` for array shape and the
  parsers' field mappings.

## Type-Checking the Test Tree

The build `tsconfig.json` has `rootDir: ./src` and must not see test files, so the test
tree is type-checked through a separate **`tsconfig.test.json`** that extends it, sets
`rootDir: .` / `noEmit: true`, and widens `include` to `src` + `test`.

ESLint wires the test tree to that config via `eslint.config.mjs` and **disables
`@typescript-eslint/no-floating-promises` for `test/**`** — `node:test`'s `describe`/`it`
return promises that must not be awaited at the call site, so the rule would be all false
positives there. The rule stays **on** in `src/`, where an unawaited promise is a real
defect. Keep test code inside this carve-out; don't disable the rule in `src/`.
