---
title: "Development Workflow"
description: "How to build, type-check, lint, format, and publish the package, including the dual tsconfig setup, the dual ESM/CJS build, and common pitfalls."
category: "guide"
tags: ["development", "build", "tsdown", "typecheck", "publishing", "pitfalls"]
last_updated: "2026-11-08T21:10:46Z"
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

Node.js `^22.18.0 || >=24` (the `engines` range of `tsdown`, the strictest dev tool) and
npm. `engines: ">=18"` in `package.json` and the `node18` build target apply to consumers
only.

## The Build (tsdown)

`npm run build` runs **tsdown** (config in `tsdown.config.ts`):

- `entry: ['src/index.ts']` — the barrel is the single entry.
- `format: ['esm', 'cjs']` — emits both module systems.
- `unbundle: true` — preserves the source file structure in `dist/` instead of
  bundling into one file.
- `dts: true` — generates `.d.mts` / `.d.cts`.
- `sourcemap: false`, `clean: true`, `target: 'node18'`, `outDir: 'dist'`.

The `exports` map in `package.json` points `import` at `dist/index.mjs` (+
`.d.mts`) and `require` at `dist/index.cjs` (+ `.d.cts`). `dist/` is the only
published directory (`files: ["dist"]`) and is gitignored. `npm run dev` is the
same build in watch mode.

## Type-Checking

`npm run typecheck` runs `tsc --noEmit` against **`tsconfig.json`**, which only covers
`src/` (`rootDir: ./src`) and misses test files. Check those with
`npx tsc --noEmit -p tsconfig.test.json`
([testing.md](testing.md#type-checking-the-test-tree)).

`tsconfig.json` enables `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`noImplicitOverride`, `noImplicitReturns`, `noUnusedLocals`, `verbatimModuleSyntax`,
`isolatedModules`, `noUncheckedSideEffectImports`, and `moduleDetection: force`.

## Lint and Format

- `npm run lint` / `npm run lint:fix` — ESLint (flat config, `eslint.config.mjs`).
  Type-aware rules via `typescript-eslint` using the project service; `test/` resolves
  types from `tsconfig.test.json`.
- `npm run format` / `npm run format:check` — dprint (`dprint.json`).

See [code-style.md](code-style.md) for the rules and the dprint/ESLint split.

## Export Validation

`npm run check:exports` runs `@arethetypeswrong/cli` (`attw --pack .`) to verify the
published package resolves types correctly under both ESM and CJS consumers. It packs the
existing `dist/` without building, so run `npm run build` first. Run it after changing
`package.json` `exports`, the build format, or the barrel.

## Publishing

`prepublishOnly` chains `npm test` → `typecheck` → `build` → `check:exports`, so any failure
blocks `npm publish`. `npm test` includes live specs that need the network; a failure may
mean DDG changed, not that the code broke
([testing.md](testing.md#live-integration-tests)).

## Typical Loops

| Goal | Commands |
|------|----------|
| Implement a feature | edit `src/` → `npm run test:watch` → `npm run lint` → `npm run format` |
| Verify before commit | `npm run typecheck && npm test && npm run lint && npm run format:check` |
| Validate packaging | `npm run build && npm run check:exports` |

## Common Pitfalls

- **Forgetting `.ts` in imports.** Relative imports without it fail `tsc` under
  `module: nodenext` ([code-style.md](code-style.md#imports)).
- **Using a TypeScript `enum`.** Banned by ESLint; use the const-object pattern or a
  string-literal union ([code-style.md](code-style.md#const-object-enums-no-ts-enum)).
- **Adding a second class to a file.** `max-classes-per-file` is an error; create a new
  file ([code-style.md](code-style.md#files-and-classes)).
- **Floating promises in `src/`.** `no-floating-promises` is an error; `void` a deliberate
  fire-and-forget call. `test/` is exempt ([testing.md](testing.md#type-checking-the-test-tree)).
- **Exporting internal helpers.** Keep internal plumbing out of `src/index.ts`; the public
  surface is listed in [overview.md](overview.md#public-api).
