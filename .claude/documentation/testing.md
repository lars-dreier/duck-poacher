---
title: "Testing Guide"
description: "How the test suite is structured and run: the node:test runner via tsx, live integration tests against the real DuckDuckGo API (image and web search), offline parser, value-object, error and options specs, shared fixtures, and conventions."
category: "guide"
tags: ["testing", "node-test", "tsx", "integration", "live-api", "conventions"]
last_updated: "2026-11-09T21:41:39Z"
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

Tests use the built-in `node:test` runner with `node:assert/strict`, executed through tsx so
TypeScript runs without a separate compile step.

## Running Tests

| Command | Purpose |
|---------|---------|
| `npm test` | Run the offline specs once (`test/**/!(*.live).test.ts`); no network |
| `npm run test:live` | Run the live specs once (`test/**/*.live.test.ts`), one file at a time |
| `npm run test:coverage` | Run all specs, offline and live, with `--experimental-test-coverage`, one file at a time |
| `npm run test:watch` | Re-run the offline specs on change |

The underlying invocations are `tsx --test "test/**/!(*.live).test.ts"` and
`tsx --test --test-concurrency=1 "test/**/*.live.test.ts"`. The offline glob relies on the
test runner's extglob support. `prepublishOnly` runs both.

## Live Integration Tests

This package scrapes DuckDuckGo's undocumented image and web search endpoints, so the
`*.live.test.ts` specs hit the real API. They run only through `npm run test:live`, never in
`npm test` or `test:watch`. Live specs deliberately don't mock, stub or record the network:
a double would only prove the code calls itself, not that it still works against a live,
drifting target. A double is fine in an offline spec that tests the client's own logic for a
failure DDG can't be made to produce on demand, such as the 403 mapping in
`ImageSearchClient.test.ts`.

- **Network is required** for live specs; they fail without connectivity.
- **DDG can break them.** A failure usually means DDG changed, not that the test is flaky:
  investigate the real response before "fixing" the test. What drifts is in
  [architecture.md](architecture.md#duckduckgo-protocol-quirks).
- **Bot challenges fail the run.** No spec skips or tolerates one: `BotChallengeError` rejects
  the live `imageSearch` specs ([architecture.md](architecture.md#duckduckgo-protocol-quirks)).
- **DDG rate-limits repeated runs.** A few back-to-back `test:live` runs get `i.js` blocked
  for a while. That is why live specs are kept out of `npm test` and run one file at a time.
  Run them deliberately, not in a loop.

## Test Layout

`test/` mirrors the `src/` folder structure:

```
test/
  TestHelper.ts                    shared fixtures (not a spec)
  DuckDuckGo.live.test.ts          live: public facade, imageSearch and webSearch
  common/
    BotChallengeError.test.ts      offline: error name, reason, message, cause
    GlobalSearchOptions.test.ts    offline: safe search cookie headers, safeSearchParam values
  image/
    ImageSearchClient.live.test.ts live: image token generation + search
    ImageSearchClient.test.ts      offline: i.js 403 → BotChallengeError, other HTTP errors pass through
    ImageSearchParser.test.ts      offline: JSON string to ImageSearchResult, bot challenges
    ImageSearchResult.test.ts      offline: value object
  web/
    WebSearchClient.live.test.ts   live: web search-URL generation + search
    WebSearchParser.test.ts        offline: d.js string to WebSearchResult
```

Specs end in `.test.ts`; support files do not, so the globs skip them. A spec that hits
DuckDuckGo ends in `.live.test.ts`, which is all that routes it to `test:live` instead of
`npm test`.

## Shared Fixtures

`test/TestHelper.ts` exports the fixtures the live specs share:

- `TEST_QUERY`: `'mountain landscape'`, a stable, result-rich query.
- `NETWORK_TIMEOUT_MS`: `30_000`, passed as the `it` timeout option.
- `assertHttpUrl(value, label)`: asserts a non-empty string matching `/^https?:\/\//`.

Offline specs build inputs inline: `ImageSearchParser.test.ts` uses a `JSON.stringify`'d
`{ results: [...] }` or `{ challenge: {...} }` body, and `WebSearchParser.test.ts` uses a
string embedding the `DDG.pageLayout.load('d',[...])` marker the parser scans for.

## Conventions

- **Structure:** `describe` per class, nested `describe` per member (method, getter or
  `constructor`), `it` per behavior.
- **Given/When/Then:** each `it` body carries `// Given`, `// When`, `// Then` comments
  narrating the scenario. Where `assert.throws` both acts and asserts, `// When` and
  `// Then` sit together above it.
- **Construction:** inject the parser and a `DdgHttpClient` through the client constructor, e.g.
  `new ImageSearchClient(new ImageSearchParser(), new DdgHttpClient())`; the facade is
  `new DuckDuckGo()` ([code-style.md](code-style.md#dependency-injection)). Offline client
  specs inject a `DdgHttpClient` subclass that overrides `get` instead (`FailingHttpClient`
  in `ImageSearchClient.test.ts`), which avoids casts.
- **Network timeout:** pass `{ timeout: NETWORK_TIMEOUT_MS }` as the `it` options argument on
  every live spec; omit it on offline specs. A spec that searches mints a token first, so two
  sequential requests share that budget.
- **Live assertions:** assert on shape, never on specific results, which change constantly.
  Use `assert.match` for tokens and URLs (`/^[\d-]+$/` for the image vqd;
  `/^https:\/\/links\.duckduckgo\.com\/d\.js\?/` and `/[&?]dp=/` for the web search URL;
  `ex=-1`, `ex=-2` and `p=1` parameters for its safe search levels), `assertHttpUrl` for
  result URLs, and `assert.ok(results.length > 0, ...)` for non-empty lists.
- **Offline assertions:** `assert.equal` for field mappings, `assert.deepEqual` for header
  objects, `assert.throws` with a validator function or `{ name, reason }` object for
  `BotChallengeError`, and `assert.rejects` with a validator function for async client
  methods.

## Type-Checking the Test Tree

`npm run typecheck` covers only `src/`; `tsconfig.test.json` adds `test/`
([development.md](development.md#type-checking)). `eslint.config.mjs` turns off
`@typescript-eslint/no-floating-promises` for `test/**/*.ts`, because `node:test`'s
`describe`/`it` return promises that must not be awaited at the call site.
