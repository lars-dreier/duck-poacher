---
title: "Code Style & Conventions"
description: "How code is written: naming, files and classes, class member order, access modifiers, fields and constructor parameters, dependency injection, types, const-object enums, imports, formatting and comments."
category: "guide"
tags: ["code-style", "conventions", "naming", "oop", "member-order", "eslint", "dprint"]
last_updated: "2026-11-09T21:41:39Z"
related_docs: ["development.md", "architecture.md", "testing.md"]
---

# Code Style & Conventions

## Table of Contents
1. [Tooling Split: dprint vs ESLint](#tooling-split-dprint-vs-eslint)
2. [Naming](#naming)
3. [Files and Classes](#files-and-classes)
4. [Class Member Order](#class-member-order)
5. [Access Modifiers](#access-modifiers)
6. [Fields and Constructor Parameters](#fields-and-constructor-parameters)
7. [Dependency Injection](#dependency-injection)
8. [Types](#types)
9. [const-object Enums (no TS `enum`)](#const-object-enums-no-ts-enum)
10. [Imports](#imports)
11. [Formatting](#formatting)
12. [Comments](#comments)

---

Rules marked **[lint]** or **[fmt]** fail `npm run code-style:lint` / `npm run code-style:format:check`; rules naming a compiler option
(`verbatimModuleSyntax`, `noImplicitReturns`) fail `npm run typecheck`; everything else is checked in review.

## Tooling Split: dprint vs ESLint

dprint owns layout, ESLint owns correctness and project conventions. `eslint-config-prettier` disables ESLint's layout
rules in `eslint.config.mjs` so the two never fight. The one exception follows it: a local `arguments-per-line` rule for `src/`,
because dprint keeps arguments one per line but can't require it.

`npm run code-style:apply` runs ESLint's fixes, then dprint, in the order that rule needs. To verify without
changing files, run `npm run code-style:lint` and `npm run code-style:format:check`: passing one says nothing about the
other.

## Naming

| Element | Convention | Example |
|---------|-----------|---------|
| Folders | lowercase; prefer a single word | `common/`, `image/`, `web/` |
| Class files | PascalCase, match the class | `ImageSearchClient.ts` |
| Type alias files | PascalCase, match the main type | `DdgSearchOptions.ts`, `DdgImageSearchOptions.ts` |
| const-object enum files | PascalCase, match the enum | `SafeSearchParam.ts` → `SafeSearchParam` |
| Test files | class name + `.test.ts` | `GlobalSearchOptions.test.ts` |
| Classes | PascalCase | `DuckDuckGo`, `WebSearchParser` |
| Interfaces | PascalCase, prefixed `I` **[lint]** | `IDdgResult`, `IDdgWebResult` |
| Type aliases | PascalCase, no prefix | `DdgSafeSearch`, `DdgSearchOptions` |
| Methods / locals / parameters | camelCase | `generateToken`, `searchUrl` |
| Private fields, accessors and parameter properties | `_camelCase` **[lint]** | `_parser`, `_options`, `_safeSearch` |
| Private methods | camelCase, no underscore | `createSearchUrl` |
| Unused parameters after the last used one | `_` prefix **[lint]** | — |
| Static readonly constants | UPPER_SNAKE_CASE **[lint]** | `SEARCH_HEADERS`, `TOKEN_REGEX` |
| Boolean fields and locals | `is` / `has` / `can` prefix | `isInString` |

**Acronyms are written as words:** `Ddg`, `Http`, `Url`, `Json`. Never `DDG`, `HTTP`, `URL`. This applies to
identifiers only; prose, comments and string literals write acronyms normally ("the live DDG API"). Names from
outside the project keep their upstream spelling: Node/web globals (`URLSearchParams`, `JSON`) and
`node-http-toolkit`'s exports (`HttpMethod`, `AsyncResolvingHttpRequest`). UPPER_SNAKE_CASE constants keep the
capitals (`SEARCH_URL_REGEX`).

The facade is spelled `DuckDuckGo` in full; the `Ddg` short form appears in the public option types, `DdgHttpClient`
and DDG protocol shapes (`IDdgResult`).

**Public option shapes are type aliases, not interfaces.** `DdgSearchOptions` and `DdgImageSearchOptions` are
`type`s so that they keep their published names without the `I` prefix; `DdgImageSearchOptions` extends the shared
options by intersection (`DdgSearchOptions & { ... }`).

## Files and Classes

Behavior lives in classes. Each class file default-exports exactly **one** class (one class declaration per file is
**[lint]**) and is named after it.

| Kind | Form | Example |
|---|---|---|
| State or behavior (unless a row below applies) | class | `ImageSearchClient`, `GlobalSearchOptions` |
| Value objects | class with `public readonly` constructor parameter properties | `WebSearchResult` |
| Type aliases and const-object enums | named export from a file named exactly like it; companion types may sit beside the main one | `DdgImageSearchOptions.ts` (`DdgSize`, `DdgLayout`, …) |
| Internal protocol shapes | non-exported `I`-prefixed interfaces beside the one class that reads them | `IDdgWebResult` in `WebSearchParser.ts` |

In `src/`, a file's name always matches its class or type, casing included, and free-standing functions are not
exported (`test/TestHelper.ts` holds the test fixtures and `assertHttpUrl`). The barrel `src/index.ts` is the exception
to the naming rule: it only re-exports.

## Class Member Order

Members appear in this order **[lint]**:

1. Fields (`private static readonly SEARCH_HEADERS`)
2. Constructor
3. Getters and setters, each setter directly after its getter (adjacency is checked in review)
4. Methods

Within fields, getters/setters and methods, static members come before instance members, and each of those runs
public, protected, private. Within that, keep related members together rather than sorting alphabetically.

```ts
/**
 * Talks to DuckDuckGo's web endpoint: scrapes the signed `links.duckduckgo.com/d.js` URL from the search page, then
 * fetches it with browser-like script headers. The safe search level is fixed into that URL when it is scraped.
 */
export default class WebSearchClient {
	private static readonly TOKEN_HEADERS: http.OutgoingHttpHeaders = {
		dnt: '1'
	};

	public constructor(
		private readonly _parser: WebSearchParser,
		private readonly _httpClient: DdgHttpClient,
	) {}

	public async generateToken(query: string, options?: DdgSearchOptions): Promise<string> {
		// …
	}

	public async webSearch(query: string, searchUrl: string): Promise<WebSearchResult[]> {
		// …
	}
}
```

## Access Modifiers

Every class member declares `public`, `private` or `protected` explicitly, including the constructor **[lint]**.
`protected` only where a subclass needs the seam.

## Fields and Constructor Parameters

- Private state is held in `private` `_`-prefixed fields. When callers need it, expose it through a `public` getter,
  with a setter only where mutation is intended; immutable public data follows the `public readonly` rule below.
- Fields are initialized at declaration with explicit types, `new` initializers included:
  `private readonly _webSearch: WebSearchClient = new WebSearchClient(new WebSearchParser(), new DdgHttpClient());`.
- Fixed configuration is a `private static readonly` constant (`SEARCH_HEADERS`, `TOKEN_REGEX`, `OPTION_NAMES`),
  accessed through the class name: `WebSearchClient.SEARCH_HEADERS`.
- Injected dependencies are constructor parameter properties: `private readonly _parser: WebSearchParser`. With more
  than one, each goes on its own line.
- Immutable public data uses `public readonly` constructor parameter properties instead of a field plus a getter
  (`ImageSearchResult`, `WebSearchResult`).
- Anything that never changes after construction is `readonly`.

## Dependency Injection

Constructor injection only, wired by hand.

- Every dependency is a constructor parameter (`ImageSearchClient` receives its `ImageSearchParser` and `DdgHttpClient`).
- Classes don't call `new` on their dependencies. `DuckDuckGo` is the composition root: it builds both clients,
  their parsers and a `DdgHttpClient` for each, so the public `new DuckDuckGo()` stays argument-free. Tests build the
  graph themselves (`new WebSearchClient(new WebSearchParser(), new DdgHttpClient())`).
- Value objects and per-request helpers may be constructed anywhere: results, errors, `URLSearchParams`,
  `GlobalSearchOptions`, and `node-http-toolkit`'s request/reader objects.
- No module-level singletons or mutable module state.

## Types

- Explicit return types on every function and method **[lint]**; inline callbacks passed as arguments are exempt.
- Explicit types on every variable declaration, destructuring included **[lint]**. Exempt:
  - initializers that already name the type: `new X()`, `x as T` (const-object enums included) and arrow functions
    with a declared return type. These need an annotation only when the variable's type differs;
  - `for...of` / `for...in` loop variables (TypeScript allows no annotation there).

  Annotations exist for the reader: write the domain name (`WebSearchResult[]`, `DdgImageSearchOptions`).
- Inside a class, a helper function is a private method rather than an arrow assigned to a `const`.
- `unknown` instead of `any` **[lint]**; narrow with type guards or a cast to a named protocol shape
  (`JSON.parse(responseText) as IDdgResponse`).
- A closed mapping over a union is a `switch` with one `case` per member and no `default`, so a new member fails
  `npm run typecheck` under `noImplicitReturns` (`GlobalSearchOptions.createSafeSearchCookie`).

## const-object Enums (no TS `enum`)

TypeScript `enum` is **banned** **[lint]**. Use the const-object pattern, exporting a value and a same-named type:

```ts
const SafeSearchParam = {
	Off: '-1',
	Moderate: '1',
	Strict: '1'
} as const;
type SafeSearchParam = typeof SafeSearchParam[keyof typeof SafeSearchParam];
export { SafeSearchParam };
```

A plain object at runtime (no enum IIFE, no reverse mappings), tree-shakeable, and indexable by a union-typed key
(`SafeSearchParam[this._safeSearch]`). For a closed set with no runtime values, a string-literal
union type is enough (`DdgSafeSearch`, `DdgSize`).

## Imports

- Relative imports include the **`.ts`** extension: `import WebSearchResult from './WebSearchResult.ts';`. This
  works because `tsconfig.json` sets `allowImportingTsExtensions` + `rewriteRelativeImportExtensions`; the tsdown
  build emits `.mjs` / `.cjs` import paths.
- Type-only imports use `import type` / `export type` (`verbatimModuleSyntax`).
- Node built-ins use the `node:` prefix. In `src/` they are namespace imports
  (`import type * as http from 'node:http';`); tests use `import assert from 'node:assert/strict';` and
  `import { describe, it } from 'node:test';`.
- Default export for classes; named exports for type aliases, const-object enums and companion types. The barrel
  re-exports classes as `export { default as DuckDuckGo }` and types with `export type`.

## Formatting

From `dprint.json` **[fmt]**:

| Setting | Value |
|---------|-------|
| Indentation | **tabs**, width 2 |
| Line width | 120 |
| Quotes | prefer single |
| Semicolons | prefer |
| Trailing commas | never (except multi-line parameters: `onlyMultiLine`) |
| `nextControlFlowPosition` | next line (`}` and `else {` / `catch {` on separate lines) |
| Line endings | LF |

In `src/`, calls and `new` expressions with three or more arguments put each argument on its own line **[lint]**, so
that pairs like `params.append('q', query)` stay together. Specs are not linted for this.

## Comments

Every class carries a short `/** ... */` JSDoc summary, ideally one sentence, saying what it does. Add a salient
behavior (what it scrapes, what it throws on) only when the signature and code don't show it. The public surface (`DuckDuckGo`'s methods, the exported option types and result
properties) is documented member by member. Inline comments are reserved for non-obvious decisions:
`// Order is important` above `OPTION_NAMES`, the browser-header mimicry in `WebSearchClient`, why the signed
`d.js` URL is scraped rather than built.

Class and method JSDoc is always multiline, even for one sentence; fields, constants, type aliases and their members,
and constructor parameters may use the single-line form:

```ts
/**
 * A single web search hit. Immutable.
 */
export default class WebSearchResult {
	public constructor(
		/** Title of the result page. */
		public readonly title: string,
		// …
	) {}
}
```

`removeComments: false` in `tsconfig.json` keeps the JSDoc in the generated `.d.mts` / `.d.cts`, where consumers'
editors show it.
