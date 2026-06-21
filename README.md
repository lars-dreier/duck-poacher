# duck-poacher

A Node.js library for image and web search via DuckDuckGo. Image search returns
image and thumbnail URLs for a query, with optional filters for size, color,
type, and more; web search returns the title, URL, and description of each result.

It calls DuckDuckGo's search endpoints, which are not a public, versioned API.
Response formats can change on DuckDuckGo's side and break the library.

## Install

```sh
npm install duck-poacher
```

Requires Node.js 18 or newer. The package ships dual ESM/CJS, with both `import`
and `require` entry points.

## Usage

`DuckDuckGo` is the client. Construct one and call `imageSearch` — it returns a
parsed `ImageSearchResult[]` (objects with `imageUrl` / `thumbnailUrl`, not a raw
string) and manages the per-session `vqd` token for you, so there is no token to
pass.

```ts
import { DuckDuckGo, type DdgSearchOptions, type ImageSearchResult } from 'duck-poacher';

const ddg = new DuckDuckGo();

const options: DdgSearchOptions = {
  size: 'Large',
  layout: 'Square',
  safeSearch: true,
};
const results: ImageSearchResult[] = await ddg.imageSearch('mountain landscape', options);

for (const result of results) {
  console.log(result.imageUrl, result.thumbnailUrl);
}
```

For web search, call `webSearch` — it returns a parsed `WebSearchResult[]` (objects
with `title` / `url` / `description`) and manages the per-session search URL for
you. It takes no options.

```ts
import { DuckDuckGo, type WebSearchResult } from 'duck-poacher';

const ddg = new DuckDuckGo();

const results: WebSearchResult[] = await ddg.webSearch('Node.js best practices');

for (const result of results) {
  console.log(result.title, result.url, result.description);
}
```

Each call makes two live requests (mint the token, then search). There is no
built-in multi-query, dedupe, or cap.

## API

| Export | Kind | Purpose |
|--------|------|---------|
| `DuckDuckGo` | class | The client: `imageSearch(query, options?)` and `webSearch(query)`, token managed internally |
| `ImageSearchResult` | class | Immutable value object `{ thumbnailUrl, imageUrl }` |
| `WebSearchResult` | class | Immutable value object `{ title, url, description }` |
| `DdgSearchOptions` | type | Filter options for `imageSearch` (image search only) |
| `DdgTime` `DdgSize` `DdgColor` `DdgType` `DdgLayout` `DdgLicense` | type | String-union option values |

### `DuckDuckGo`

- **`imageSearch(query: string, options?: DdgSearchOptions): Promise<ImageSearchResult[]>`**
  — generates a per-session `vqd` token, runs the image search, and returns the
  parsed results. Throws `Error('Unable to read token from DuckDuckGo response.')`
  if the token cannot be scraped; a malformed response body throws.
- **`webSearch(query: string): Promise<WebSearchResult[]>`** — scrapes a per-session
  signed search URL, runs the web search, and returns the parsed results. Throws
  `Error('Unable to read search URL from DuckDuckGo response.')` if the URL cannot
  be scraped; a malformed response body throws.

### `DdgSearchOptions`

All fields are optional. `safeSearch` is a boolean; the rest are string unions:

| Option | Type | Values |
|--------|------|--------|
| `time` | `DdgTime` | `Day` `Week` `Month` |
| `size` | `DdgSize` | `Small` `Medium` `Large` `Wallpaper` |
| `color` | `DdgColor` | `color` `Monochrome` |
| `type` | `DdgType` | `photo` `clipart` `gif` `transparent` `line` |
| `layout` | `DdgLayout` | `Square` `Tall` `Wide` |
| `license` | `DdgLicense` | `Any` `Public` |
| `safeSearch` | `boolean` | safe search on / off |

## Error handling

Errors are thrown rather than swallowed. Token generation throws if no `vqd` token
(image search) or signed search URL (web search) can be read from the response.
HTTP failures (status ≥ 400, network errors, timeouts) reject from the underlying
request and propagate to the caller.

## Development

| Command | Does |
|---------|------|
| `npm run build` | tsdown → dual ESM/CJS in `dist/` |
| `npm test` | run all `test/**/*.test.ts` (hits the live DuckDuckGo API) |
| `npm run typecheck` | `tsc --noEmit` over `src/` |
| `npm run lint` / `lint:fix` | ESLint |
| `npm run format` / `format:check` | dprint |
| `npm run check:exports` | `attw` validates the published export map |

The only runtime dependency is
[`node-http-toolkit`](https://www.npmjs.com/package/node-http-toolkit), which
provides the HTTP layer.

The tests run against the live DuckDuckGo endpoints, so they require network
access.

## License

ISC © Lars Dreier
