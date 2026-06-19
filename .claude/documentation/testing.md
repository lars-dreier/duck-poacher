---
title: "Testing Guide"
description: "How the test suite is structured and run: the node:test runner via tsx, live integration tests against the real DuckDuckGo API, shared fixtures, and the naming/comment conventions."
category: "guide"
tags: ["testing", "node-test", "tsx", "integration", "live-api", "conventions"]
last_updated: "2026-06-20T00:00:00Z"
related_docs: ["development.md", "code-style.md"]
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
import { afterEach, describe, it } from 'node:test';
```

## Running Tests

| Command | Purpose |
|---------|---------|
| `npm test` | Run all `test/**/*.test.ts` once |
| `npm run test:coverage` | Run with `--experimental-test-coverage` |
| `npm run test:watch` | Re-run on change |

The underlying invocation is `tsx --test "test/**/*.test.ts"`.

## Live Integration Tests

This package is a thin scraper over DuckDuckGo's undocumented image endpoints, so
the tests that matter **hit the real DDG API** rather than mocking it. There is no
local HTTP server, no recorded fixture, and no test double for the network layer —
those would only prove the code calls itself, not that it still works against a
live, drifting target. The suite is the live-network validation.

Consequences to keep in mind:

- **Network is required.** The API and engine specs fail without connectivity.
  Only `ImageSearchResult.test.ts` (a pure value object) runs offline.
- **DDG can break the tests.** DDG changes its `vqd` token format, the `i.js`
  response shape, headers it accepts, and its transport (responses are chunked,
  with no `content-length`). A failure here usually means DDG changed, not that the
  test is flaky — investigate the real response before "fixing" the test. The
  `content-length` quirk is why the API uses `HttpRequest` and not
  `AsyncResolvingHttpRequest` (which rejects without that header).
- **Assert on shape, not content.** Specs assert that a token matches `/^[\d-]+$/`,
  that results are a non-empty array, that URLs are absolute http(s), that results
  dedupe and cap at 100 — never on specific images, which change constantly.
- **Generous timeouts.** Each request carries an explicit timeout (see
  `NETWORK_TIMEOUT_MS`); the engine, which runs a token request plus several
  searches sequentially, gets a multiple of it.

## Test Layout

`test/` mirrors `src/` one-to-one. Each source file has a sibling spec under the
matching folder:

```
test/
  TestHelper.ts                              shared fixtures (not a spec)
  image-search/
    api/DuckDuckGoAPI.test.ts                live: token + image search
    engine/DuckDuckGoImageSearchEngine.test.ts  live: search, dedupe, cap
    types/ImageSearchResult.test.ts          offline: value object
```

Specs end in `.test.ts`; support files (shared fixtures) do not, so the glob skips
them.

## Shared Fixtures

`test/TestHelper.ts` holds the fixtures shared across the live specs — prefer it
over hand-rolling values in each test:

- `TEST_QUERY` — a stable, image-rich query (`'mountain landscape'`) so results are
  reliably non-empty across runs.
- `NETWORK_TIMEOUT_MS` — the per-request budget passed as the `it` timeout option.
- `assertHttpUrl(value, label)` — asserts a value is a non-empty absolute http(s)
  URL, used to validate every returned image and thumbnail URL.

These are plain fixtures and assertions, not resources — there is nothing to tear
down, so no `afterEach` cleanup is needed.

## Conventions

- **Structure:** `describe` per class (and a nested `describe` per method),
  `it` per behavior.
- **Given/When/Then:** each `it` body carries `// Given`, `// When`, `// Then`
  comments narrating the scenario. Follow this — it is consistent across the suite.
- **Network timeout:** pass `{ timeout: NETWORK_TIMEOUT_MS }` (or a multiple) as the
  `it` options argument on any spec that makes a request.
- **Issue markers:** when a spec pins a specific regression, end its name with
  `[#N]` referencing the issue.
- **Async rejection:** use `assert.rejects(promise, /pattern/)` for expected
  failures rather than try/catch.

## Type-Checking the Test Tree

The build `tsconfig.json` has `rootDir: ./src` and must not see test files, so the
test tree is type-checked through a separate **`tsconfig.test.json`** that extends
it, sets `rootDir: .` / `noEmit: true`, and widens `include` to `src` + `test`.

ESLint wires the test tree to that config and **disables
`@typescript-eslint/no-floating-promises` for `test/**`** — `node:test`'s
`describe`/`it` return promises that must not be awaited at the call site, so the
rule would be all false positives there. The rule stays **on** in `src/`, where an
unawaited promise is a real defect. Keep test code inside this carve-out; don't
disable the rule in `src/`.
