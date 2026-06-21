# Documentation Index

## [architecture.md](architecture.md)

How duck-poacher works inside: the `DuckDuckGo` facade over `ImageSearchClient` and `WebSearchClient` (each with its own parser and result type), the token→search→parse flow for both image and web search, option encoding, data models, and DuckDuckGo protocol quirks.

**Use when:**

- Changing image or web search behavior, option encoding, or response parsing
- Understanding how DuckDuckGo delegates to the image/web clients and parsers
- Debugging DuckDuckGo protocol quirks (vqd token, signed d.js URL) or error handling

## [code-style.md](code-style.md)

Naming, OOP, enum, accessibility, formatting, and import conventions, plus the ESLint/dprint rules that enforce them.

**Use when:**

- Writing new code or reviewing for consistency
- Deciding naming, access modifiers, or import/`.ts` extension style
- Resolving an ESLint or dprint formatting issue

## [development.md](development.md)

How to build, type-check, lint, format, and publish: dual tsconfig setup, dual ESM/CJS build, and common pitfalls.

**Use when:**

- Running or debugging the build, typecheck, or publish flow
- Configuring tsdown or hitting a build/export-validation pitfall

## [overview.md](overview.md)

What duck-poacher is: its stack, install steps, the public API surface (`DuckDuckGo` with `imageSearch`/`webSearch`, plus `ImageSearchResult` and `WebSearchResult`), runnable usage examples, and the project layout.

**Use when:**

- Getting oriented or onboarding to the project
- Looking up the public API or a usage example
- Finding where something lives in the project structure

## [testing.md](testing.md)

How the test suite is structured and run: the node:test runner via tsx, the live `DuckDuckGo`/`ImageSearchClient`/`WebSearchClient` integration specs, the offline parser/value-object specs, shared fixtures, and conventions.

**Use when:**

- Writing or running tests, or diagnosing a failing live-API spec
- Adding a fixture or deciding what to assert against DDG's drifting responses
