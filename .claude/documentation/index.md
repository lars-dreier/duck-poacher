# Documentation Index

## [architecture.md](architecture.md)

How duck-poacher works inside: the `DuckDuckGo` composition root over `ImageSearchClient` and `WebSearchClient`, the token→search→parse flow, filter encoding, safe search handling, parsers, bot-challenge detection, and DuckDuckGo protocol quirks.

**Use when:**

- Changing image or web search behavior, option encoding, safe search, or response parsing
- Debugging DuckDuckGo protocol quirks (vqd token, signed d.js URL, bot challenges)
- Deciding what a failure throws or where an error comes from

## [code-style.md](code-style.md)

How code is written: naming, files and classes, member order, access modifiers, dependency injection, types, const-object enums, imports, formatting and comments, with markers for what lint and dprint enforce.

**Use when:**

- Writing new code or reviewing for consistency
- Deciding naming, member order, constructor injection, or import style
- Resolving an ESLint or dprint issue

## [development.md](development.md)

How to build, type-check, lint, format, and publish: required Node version, dual tsconfig setup, dual ESM/CJS build, and common pitfalls.

**Use when:**

- Running or debugging the build, typecheck, or publish flow
- Configuring tsdown or hitting a build/export-validation pitfall

## [overview.md](overview.md)

What duck-poacher is: its stack, install steps, the public API surface (`DuckDuckGo`, `BotChallengeError`, result classes, option types and values), runnable usage examples, and the project layout.

**Use when:**

- Getting oriented or onboarding to the project
- Looking up the public API, an option value, or a usage example
- Finding where something lives in the project structure

## [testing.md](testing.md)

How the test suite is structured and run: the node:test runner via tsx, the live `DuckDuckGo`/`ImageSearchClient`/`WebSearchClient` specs, the offline parser, value-object, error and options specs, shared fixtures, and conventions.

**Use when:**

- Writing or running tests, or diagnosing a failing live-API spec
- Adding a fixture or deciding what to assert against DDG's drifting responses
