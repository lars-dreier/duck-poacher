---
title: "Development Workflow"
description: "How to build, type-check, lint, format, and publish the package, including the dual tsconfig setup, the dual ESM/CJS build, and common pitfalls."
category: "guide"
tags: ["development", "build", "tsdown", "typecheck", "publishing", "pitfalls"]
last_updated: "2026-06-19T19:03:11Z"
related_docs: ["overview.md", "code-style.md", "testing.md"]
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
- `sourcemap: true`, `clean: true`, `target: 'node18'`, `outDir: 'dist'`.

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
`verbatimModuleSyntax`, `isolatedModules`. Source authored with `.ts` import
extensions relies on `allowImportingTsExtensions` + `rewriteRelativeImportExtensions`.

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

`prepublishOnly` chains `typecheck` → `build` → `check:exports`, so `npm publish`
will not proceed unless types pass, the build succeeds, and the export map
validates. The package is ESM-first (`"type": "module"`) but ships CJS too.

## Typical Loops

| Goal | Commands |
|------|----------|
| Implement a feature | edit `src/` → `npm run test:watch` → `npm run lint` → `npm run format` |
| Verify before commit | `npm run typecheck && npm test && npm run lint && npm run format:check` |
| Validate packaging | `npm run build && npm run check:exports` |

## Common Pitfalls

- **Forgetting `.ts` in imports.** Relative imports must include `.ts` (e.g.
  `'./HttpError.ts'`). Omitting it fails under this tsconfig.
- **Using a TypeScript `enum`.** Banned by ESLint — use the const-object pattern
  ([code-style.md](code-style.md#const-object-enums-no-ts-enum)).
- **Adding a second class to a file.** `max-classes-per-file` is an error; create
  a new PascalCase file and export it from the barrel if it is public.
- **Floating promises in `src/`.** `no-floating-promises` is an error in source;
  `void` a fire-and-forget call deliberately (the code does this for
  `void this.sendRequest(...)`). The rule is off only for `test/`.
- **Editing `dist/`.** It is generated and gitignored; change `src/` and rebuild.
- **Type-checking misses test files.** `tsc --noEmit` (base config) only sees
  `src/`. Use `tsconfig.test.json` to check tests.
- **Non-GET requests hanging.** `HttpRequest` must call `request.end()` (and
  `write` the body) for non-GET methods; this is load-bearing (tests `[#6]`).
- **Exporting internal helpers.** `FileSystem` is intentionally not in the barrel;
  keep internal plumbing out of `src/index.ts`.
