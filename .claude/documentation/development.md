---
title: "Development Workflow"
description: "How to build, type-check, lint, format, and publish the package, including the dual tsconfig setup, the dual ESM/CJS build, and common pitfalls."
category: "guide"
tags: ["development", "build", "tsdown", "typecheck", "publishing", "pitfalls"]
last_updated: "2026-06-20T09:17:12Z"
related_docs: ["overview.md", "architecture.md", "code-style.md", "testing.md"]
---

# Development Workflow

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [The Build (tsdown)](#the-build-tsdown)
3. [Type-Checking](#type-checking)
4. [Lint and Format](#lint-and-format)
5. [Export Validation](#export-validation)
6. [Publishing](#publishing)
7. [Typical Loops](#typical-loops)
8. [Common Pitfalls](#common-pitfalls)

---

## Prerequisites

Node.js (build target is `node18`; `@types/node` is v25) and npm. Install with
`npm install`.

## The Build (tsdown)

`npm run build` runs **tsdown** (config in `tsdown.config.ts`):

- `entry: ['src/index.ts']` — the barrel is the single entry.
- `format: ['esm', 'cjs']` — emits both module systems.
- `unbundle: true` — preserves the source file structure in `dist/` instead of
  bundling into one file.
- `dts: true` — generates `.d.ts` (and `.d.mts` / `.d.cts`).
- `sourcemap: false`, `clean: true`, `target: 'node18'`, `outDir: 'dist'`.

The `exports` map in `package.json` points `import` at `dist/index.mjs` (+
`.d.mts`) and `require` at `dist/index.cjs` (+ `.d.cts`). `dist/` is the only
published directory (`files: ["dist"]`) and is gitignored. `npm run dev` is the
same build in watch mode.

## Type-Checking

`npm run typecheck` runs `tsc --noEmit` against **`tsconfig.json`**, which only
covers `src/` (`rootDir: ./src`). To type-check tests as well, ESLint and any
manual check use **`tsconfig.test.json`** (extends the base, `rootDir: .`,
includes `src` + `test`). See [testing.md](testing.md#type-checking-the-test-tree).

`tsconfig.json` is strict and then some: `strict`, `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `noImplicitOverride`, `noUnusedLocals`,
`verbatimModuleSyntax`, `isolatedModules`, plus `noUncheckedSideEffectImports`
and a forced `moduleDetection`. Source authored with `.ts` import extensions
relies on `allowImportingTsExtensions` + `rewriteRelativeImportExtensions`.

## Lint and Format

- `npm run lint` / `npm run lint:fix` — ESLint (flat config, `eslint.config.mjs`).
  Type-aware rules via `typescript-eslint` using the project service; the test
  tree resolves types from `tsconfig.test.json`. ESLint enforces the project's
  architectural invariants (one class per file, explicit accessibility, no TS
  `enum`, no floating promises in `src/`).
- `npm run format` / `npm run format:check` — dprint (`dprint.json`). dprint owns
  all layout; ESLint's layout rules are disabled via `eslint-config-prettier`.

Run both. See [code-style.md](code-style.md) for the rules and the rationale
behind the dprint/ESLint split.

## Export Validation

`npm run check:exports` runs `@arethetypeswrong/cli` (`attw --pack .`) to verify
the published package resolves types correctly under both ESM and CJS consumers.
Run it after changing `package.json` `exports`, the build format, or the barrel.

## Publishing

`prepublishOnly` chains `npm test` → `typecheck` → `build` → `check:exports`, so
`npm publish` will not proceed unless the live tests pass, types pass, the build
succeeds, and the export map validates. The package is ESM-first
(`"type": "module"`) but ships CJS too.

## Typical Loops

| Goal | Commands |
|------|----------|
| Implement a feature | edit `src/` → `npm run test:watch` → `npm run lint` → `npm run format` |
| Verify before commit | `npm run typecheck && npm test && npm run lint && npm run format:check` |
| Validate packaging | `npm run build && npm run check:exports` |

## Common Pitfalls

- **Forgetting `.ts` in imports.** Relative imports must include `.ts` (e.g.
  `'./DuckDuckGoApi.ts'` from a sibling, `'../image/ImageSearchResult.ts'` from a
  subdirectory). Omitting it fails under this tsconfig.
- **Using a TypeScript `enum`.** Banned by ESLint — use a string-literal union
  (or the const-object pattern when you need a runtime value)
  ([code-style.md](code-style.md#closed-string-sets-no-ts-enum)).
- **Adding a second class to a file.** `max-classes-per-file` is an error; the
  parser's internal `DdgResponse` / `DdgResult` shapes are `interface`s for
  exactly this reason. Create a new PascalCase file (and export it from the barrel
  if it is public) when you need another class.
- **Floating promises in `src/`.** `no-floating-promises` is an error in source.
  No current `src/` code fires-and-forgets; if you ever need to, `void` the call
  deliberately. The rule is off only for `test/` (where `node:test`'s
  `describe`/`it` return promises that must not be awaited).
- **Editing `dist/`.** It is generated and gitignored; change `src/` and rebuild.
- **Type-checking misses test files.** `tsc --noEmit` (base config) only sees
  `src/`. Use `tsconfig.test.json` to check tests.
- **Live tests need the network.** `npm test` hits the real DuckDuckGo API, so a
  failure may mean DDG changed, not that your code broke. See
  [testing.md](testing.md#live-integration-tests).
- **Exporting internal helpers.** Keep internal plumbing out of `src/index.ts`.
  The barrel exports only the public surface: `DuckDuckGoApi`, `ImageSearchResult`,
  and the `Ddg*` types (`DdgColor`, `DdgLayout`, `DdgLicense`, `DdgSearchOptions`,
  `DdgSize`, `DdgTime`, `DdgType`). The `ImageSearchParser` and its internal
  interfaces (`DdgResponse`, `DdgResult`) stay unexported — callers get parsed
  results back from `imageSearch`.
