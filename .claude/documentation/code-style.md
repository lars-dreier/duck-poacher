---
title: "Code Style & Conventions"
description: "Naming, OOP, enum, accessibility, formatting, and import conventions used throughout the source, and the ESLint/dprint rules that enforce them."
category: "guide"
tags: ["code-style", "conventions", "naming", "eslint", "dprint", "oop"]
last_updated: "2026-06-19T19:03:11Z"
related_docs: ["development.md", "architecture.md"]
---

# Code Style & Conventions

## Table of Contents
1. [Tooling Split: dprint vs ESLint](#tooling-split-dprint-vs-eslint)
2. [Naming](#naming)
3. [One Class Per File](#one-class-per-file)
4. [const-object Enums (no TS `enum`)](#const-object-enums-no-ts-enum)
5. [Explicit Access Modifiers](#explicit-access-modifiers)
6. [Private Fields and Getters](#private-fields-and-getters)
7. [Imports and `.ts` Extensions](#imports-and-ts-extensions)
8. [Formatting Rules](#formatting-rules)
9. [Documentation Comments](#documentation-comments)

---

## Tooling Split: dprint vs ESLint

The project draws a hard line: **dprint owns layout, ESLint owns correctness and
project conventions.** `eslint-config-prettier` is loaded last in
`eslint.config.mjs` specifically to disable every ESLint layout rule so the two
never fight. When you change code, run both (`npm run format` then `npm run lint`)
— a passing lint does not imply correct formatting and vice versa.

## Naming

| Element | Convention | Example |
|---------|-----------|---------|
| Folders | lowercase, single word | `download/`, `request/`, `support/` |
| Class files | PascalCase, match the class | `HttpDownload.ts` |
| Classes / interfaces | PascalCase; interfaces prefixed `I` | `HttpDownload`, `IHttpDownload` |
| Methods / locals | camelCase | `sendRequest`, `requestedStart` |
| Private fields | `_camelCase` | `_totalBytes`, `_isDownloading` |
| Static constants | UPPER_SNAKE_CASE | `STREAM_ERROR_DELAY`, `WRITE_FLAGS` |

**Spell the protocol `Http`, never `HTTP`.** Every class, file, and identifier
uses `Http...` (e.g. `HttpError`, `HttpResponseReader`), never `HTTPError`. This
is a firm project convention.

## One Class Per File

Each file exports exactly **one** primary class as its default export, and the
filename matches that class. Enforced by ESLint:

```js
'max-classes-per-file': ['error', { ignoreExpressions: true, max: 1 }]
```

`ignoreExpressions` allows small inline/anonymous classes without tripping the
rule. The public barrel `src/index.ts` is the one file with many exports — it
only re-exports, it defines nothing.

## const-object Enums (no TS `enum`)

TypeScript `enum` is **banned**. Use the const-object pattern, exporting a value
and a same-named type:

```ts
const HttpMethod = {
  GET: 'GET',
  POST: 'POST'
  // ...
} as const;
type HttpMethod = typeof HttpMethod[keyof typeof HttpMethod];
export { HttpMethod };
```

Enforced by ESLint:

```js
'no-restricted-syntax': ['error', {
  selector: 'TSEnumDeclaration',
  message: 'Use the const-object enum pattern instead of `enum`...'
}]
```

This keeps enums as plain string unions at runtime (no emitted enum object,
tree-shakeable, no reverse mappings). See `HttpMethod`, `HttpProtocol`,
`HttpStatusCode`.

## Explicit Access Modifiers

Every class member declares `public`, `private`, or `protected` explicitly —
including the constructor. Enforced:

```js
'@typescript-eslint/explicit-member-accessibility': ['error', { accessibility: 'explicit' }]
```

`protected` is used deliberately where a subclass needs the seam — e.g.
`MultiStreamHttpDownload`'s `prepareStreams` / `createStreams` / `joinStreams` and
its `_url` / `_destinationPath` / `_streams` fields.

## Private Fields and Getters

State is held in `private` `_`-prefixed fields and exposed through `public`
getters (and setters only where mutation is intended). This is the dominant
pattern across the codebase:

```ts
private _totalBytes: number = 0;
public get totalBytes(): number {
  return this._totalBytes;
}
```

Constructor parameter properties are used for immutable injected dependencies
(`public readonly download`, `private readonly _url`). Fields are initialized at
declaration with explicit types rather than relying on inference.

## Imports and `.ts` Extensions

Relative imports include the **`.ts`** extension:

```ts
import HttpHeaderUtil from '../http/HttpHeaderUtil.ts';
import { HttpMethod } from '../http/HttpMethod.ts';
```

This works because `tsconfig.json` sets `allowImportingTsExtensions` +
`rewriteRelativeImportExtensions` — the compiler rewrites `.ts` to `.js` on emit,
so no post-processor is needed and `tsc -w` works. Other conventions:

- `verbatimModuleSyntax` is on, so use `import type` / `export type` for
  type-only imports (e.g. `import type IHttpDownload from './IHttpDownload.ts'`).
- Node built-ins are imported as namespaces: `import * as fs from 'fs'`,
  `import * as http from 'http'`. (Test files use the `node:` prefix, e.g.
  `node:test`, `node:http`.)
- Default export per file for classes; named exports for the const-object enums.

## Formatting Rules

From `dprint.json`:

| Setting | Value |
|---------|-------|
| Indentation | **tabs**, width 2 |
| Line width | 120 |
| Quotes | prefer single |
| Semicolons | prefer (required) |
| Trailing commas | never (except multi-line parameters: `onlyMultiLine`) |
| `nextControlFlowPosition` | next line (`else`/`catch` on their own line) |
| Line endings | LF |

The "next line" control flow produces the project's distinctive `}` then
`else {` / `catch {` on separate lines. dprint also formats JSON.

## Documentation Comments

Every class carries a block `/** ... */` JSDoc summary describing what it does and
its salient behaviors (resume, retry, timeout, etc.). Inline comments are reserved
for non-obvious decisions (e.g. why `request.end()` is needed for non-GET, why the
unit index is clamped in `HttpFormatter`). `removeComments: true` in tsconfig
strips them from build output, so comments are for source readers only.
