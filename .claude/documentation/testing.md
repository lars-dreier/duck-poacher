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
| `npm test` | Run all `test/**/*.test.ts` once |
| `npm run test:coverage` | Run with `--experimental-test-coverage` |
| `npm run test:watch` | Re-run on change |

The underlying invocation is `tsx --test "test/**/*.test.ts"`.

## Live Integration Tests

This package scrapes DuckDuckGo's undocumented image and web search endpoints, so the specs
marked `live` in [Test Layout](#test-layout) hit the real API. The network layer is
deliberately not mocked, stubbed or recorded: a double would only prove the code calls
itself, not that it still works against a live, drifting target.

- **Network is required** for live specs; they fail without connectivity.
- **DDG can break them.** A failure usually means DDG changed, not that the test is flaky:
  investigate the real response before "fixing" the test. What drifts is in
  [architecture.md](architecture.md#duckduckgo-protocol-quirks).
- **Bot challenges fail the run.** No spec skips or tolerates one: `BotChallengeError` rejects
  the live `imageSearch` specs ([architecture.md](architecture.md#duckduckgo-protocol-quirks)).

## Test Layout

`test/` mirrors the `src/` folder structure:

```
test/
  TestHelper.ts                    shared fixtures (not a spec)
  DuckDuckGo.test.ts               live: public facade, imageSearch and webSearch
  common/
    BotChallengeError.test.ts      offline: error name, reason, message
    GlobalSearchOptions.test.ts    offline: safe search cookie headers, safeSearchParam values
  image/
    ImageSearchClient.test.ts      live: image token generation + search
    ImageSearchParser.test.ts      offline: JSON string to ImageSearchResult, bot challenges
    ImageSearchResult.test.ts      offline: value object
  web/
    WebSearchClient.test.ts        live: web search-URL generation + search
    WebSearchParser.test.ts        offline: d.js string to WebSearchResult
```

Specs end in `.test.ts`; support files do not, so the glob skips them.

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
  `new DuckDuckGo()` ([code-style.md](code-style.md#dependency-injection)).
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
  `BotChallengeError`.

## Type-Checking the Test Tree

`npm run typecheck` covers only `src/`; `tsconfig.test.json` adds `test/`
([development.md](development.md#type-checking)). `eslint.config.mjs` turns off
`@typescript-eslint/no-floating-promises` for `test/**/*.ts`, because `node:test`'s
`describe`/`it` return promises that must not be awaited at the call site.
