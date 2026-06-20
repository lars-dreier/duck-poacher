# Documentation Index

## [architecture.md](architecture.md)

How ddg-search works inside: the two-layer API/Engine design, the token→search→parse→prioritize→dedupe→cap flow, option encoding, data models, and DuckDuckGo protocol quirks.

**Use when:**

- Changing search behavior, parsing, prioritization, or dedupe logic
- Understanding the API vs Engine layers or DdgSearchOptions encoding
- Debugging DuckDuckGo protocol quirks or error handling

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

What ddg-search is: its stack, install steps, the public API surface (low-level `DuckDuckGoApi` + `ImageSearchResult`), a runnable usage example, and the project layout.

**Use when:**

- Getting oriented or onboarding to the project
- Looking up the public API or a usage example
- Finding where something lives in the project structure

## [testing.md](testing.md)

How the test suite is structured and run: the node:test runner via tsx, live integration tests against the real DuckDuckGo API, shared fixtures, and conventions.

**Use when:**

- Writing or running tests, or diagnosing a failing live-API spec
- Adding a fixture or deciding what to assert against DDG's drifting responses
