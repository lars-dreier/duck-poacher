---
title: "Code Style & Conventions"
description: "Naming, OOP, enum, accessibility, formatting, and import conventions used throughout the source, and the ESLint/dprint rules that enforce them."
category: "guide"
tags: ["code-style", "conventions", "naming", "eslint", "dprint", "oop"]
last_updated: "2026-06-20T09:58:00Z"
related_docs: ["development.md", "architecture.md", "overview.md"]
---

# Code Style & Conventions

## Table of Contents
1. [Tooling Split: dprint vs ESLint](#tooling-split-dprint-vs-eslint)
2. [Naming](#naming)
3. [One Class Per File](#one-class-per-file)
4. [Closed String Sets (no TS `enum`)](#closed-string-sets-no-ts-enum)
5. [Explicit Access Modifiers](#explicit-access-modifiers)
6. [Private Fields and Constructor Properties](#private-fields-and-constructor-properties)
7. [Imports and `.ts` Extensions](#imports-and-ts-extensions)
8. [Formatting Rules](#formatting-rules)
9. [Comments](#comments)

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
| Folders | lowercase, hyphenated for multiword | `src/`, `image/` |
| Class files | PascalCase, match the class | `DdgClient.ts`, `ImageSearchClient.ts`, `ImageSearchResult.ts` |
| Classes | PascalCase | `DdgClient`, `ImageSearchClient`, `ImageSearchParser`, `ImageSearchResult` |
| Methods / locals | camelCase | `generateToken`, `imageSearch`, `createSearchUrl` |
| Private fields | `_camelCase` | `_parser`, `_imageSearch` |
| Constants (incl. `private readonly` config fields) | UPPER_SNAKE_CASE | `OPTION_NAMES`, `SEARCH_HEADERS`, `TOKEN_REGEX` |

**Acronyms are treated as ordinary words in identifiers — never all-caps.**
Capitalize only the first letter and lowercase the rest: `Api` not `API`, `Ddg`
not `DDG`, `Url` not `URL`, `Json` not `JSON`. So the client class is `DdgClient`,
the option types are `DdgSearchOptions` / `DdgSize`, and a helper is
`assertHttpUrl`.

**Spell the protocol `Http`, never `HTTP`.** This is the most common case of the
rule above: every class, file, and identifier uses `Http...` (e.g. `HttpError`,
`HttpResponseReader`), never `HTTPError`. A firm project convention.

The rule applies to identifiers only. In prose, comments, and string literals,
write acronyms normally (`HTTP GET`, "the live DDG API"). Names that come from
outside the project keep their upstream spelling: Node/web globals
(`URLSearchParams`, `JSON`, `XMLHttpRequest`) and `node-http-toolkit`'s exports
(`HttpMethod`, `AsyncResolvingHttpRequest`) are used as published.

## One Class Per File

Each file exports exactly **one** primary class as its default export, and the
filename matches that class. Enforced by ESLint:

```js
'max-classes-per-file': ['error', { ignoreExpressions: true, max: 1 }]
```

`ignoreExpressions` allows small inline/anonymous classes without tripping the
rule. The public barrel `src/index.ts` is the one file with many exports — it
only re-exports, it defines nothing. The parser's internal `DdgResponse` /
`DdgResult` shapes co-exist with `ImageSearchParser` in one file because they are
`interface`s, not classes, so the rule does not count them. The `Ddg*` option
types live alongside `ImageSearchClient` for the same reason — they are `type`
aliases, not classes.

## Closed String Sets (no TS `enum`)

TypeScript `enum` is **banned**. For a closed set of string values, this project
uses a plain **string-literal union type** — no runtime object at all. The
`Ddg*` option types are the canonical example:

```ts
export type DdgSize = 'Small' | 'Medium' | 'Large' | 'Wallpaper';
export type DdgLayout = 'Square' | 'Tall' | 'Wide';
```

When you genuinely need a **runtime value** for each member (e.g. to iterate or
reference by name), use the const-object pattern instead, exporting a value and
a same-named type — this is how `node-http-toolkit` exposes `HttpMethod`, which
this package consumes:

```ts
const HttpMethod = {
  GET: 'GET',
  POST: 'POST'
  // ...
} as const;
type HttpMethod = typeof HttpMethod[keyof typeof HttpMethod];
export { HttpMethod };
```

Either way, no `enum`. Enforced by ESLint:

```js
'no-restricted-syntax': ['error', {
  selector: 'TSEnumDeclaration',
  message: 'Use the const-object enum pattern instead of `enum` (see code-style.md).'
}]
```

This keeps enums tree-shakeable with no emitted enum object and no reverse
mappings.

## Explicit Access Modifiers

Every class member declares `public`, `private`, or `protected` explicitly —
including the constructor. Enforced:

```js
'@typescript-eslint/explicit-member-accessibility': ['error', { accessibility: 'explicit' }]
```

In `DdgClient`, the owned implementation client is a `private readonly` field
(`_imageSearch`) and the single entry point is `public` (`imageSearch`).
In `ImageSearchClient`, configuration constants are `private readonly`
(`OPTION_NAMES`, `SEARCH_HEADERS`, `TOKEN_REGEX`), the two entry points are
`public` (`generateToken`, `imageSearch`), and URL-building helpers are
`private` (`createSearchUrl`, `createImageSearchOptionsHeader`). `protected` is
available for subclass seams but is not currently used anywhere in `src/`.

## Private Fields and Constructor Properties

State is held in `private` `_`-prefixed fields. The facade's owned implementation
client and the implementation's owned parser are the examples:

```ts
// DdgClient owns the implementation client
private readonly _imageSearch = new ImageSearchClient();

// ImageSearchClient owns the parser
private readonly _parser = new ImageSearchParser();
```

Immutable public data uses **constructor parameter properties** rather than a
field plus a getter — `ImageSearchResult` is the canonical case:

```ts
public constructor(
  public readonly thumbnailUrl: string,
  public readonly imageUrl: string
) {}
```

Getters/setters are not currently used in this codebase; reach for them only
when you need computed access or controlled mutation. Fields are initialized at
declaration with explicit types where inference would be unclear.

## Imports and `.ts` Extensions

Relative imports include the **`.ts`** extension:

```ts
import ImageSearchClient from './image/ImageSearchClient.ts';
import type ImageSearchResult from './image/ImageSearchResult.ts';
```

(and from within the `image/` subdirectory, e.g. inside the parser: `import
ImageSearchResult from './ImageSearchResult.ts';`). This works because
`tsconfig.json` sets `allowImportingTsExtensions` + `rewriteRelativeImportExtensions`
— the compiler rewrites `.ts` to `.js` on emit, so no post-processor is needed and
`tsc -w` works. Other conventions:

- `verbatimModuleSyntax` is on, so use `import type` / `export type` (or inline
  `{ type X }`) for type-only imports — e.g. `import type ImageSearchResult`
  when a class is used only as a return type, and `src/index.ts`
  re-exporting the `Ddg*` types with `export type`.
- Node built-ins are imported as namespaces in `src/`: `import * as http from
  'http'`. Test files use the `node:` prefix, e.g. `node:test`,
  `node:assert/strict`.
- Default export per file for classes; the barrel `src/index.ts` re-exports them
  under their names (`export { default as DdgClient }`) and re-exports the `Ddg*`
  types with `export type`.

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

## Comments

The `src/` classes are **not** JSDoc-documented — the code carries no `/** ... */`
class summaries. Comments are sparse and reserved for non-obvious decisions: see
`// Order is important` above `OPTION_NAMES` in `ImageSearchClient` (the only inline
comment in the source), which warns that the option order is load-bearing for the
`f`-parameter encoding ([architecture.md](architecture.md#image-search-and-option-encoding)).

Test files and `TestHelper.ts` do use `/** ... */` to explain fixtures. Either
way, `removeComments: true` in `tsconfig.json` strips comments from build output,
so they exist only for source readers. If you add explanatory comments, follow
the existing bar: explain *why*, not *what*.
