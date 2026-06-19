# Documentation Index

## [code-style.md](code-style.md)

Code conventions, self-review checklist, type annotations, naming patterns.

**Use when:** Writing new code, performing reviews, ensuring consistency.

## [development.md](development.md)

How to build, type-check, lint, format, and publish: dual tsconfig setup, dual ESM/CJS build, and common pitfalls.

**Use when:**

- Running or debugging the build, typecheck, or publish flow
- Configuring tsdown or hitting a build/export-validation pitfall

## [testing.md](testing.md)

How the test suite is structured and run: the node:test runner via tsx, live integration tests against the real DuckDuckGo API, shared fixtures, and the naming/comment conventions.

**Use when:**

- Writing or running tests, or diagnosing a failing live-API spec
- Adding a fixture or deciding what to assert against DDG's drifting responses