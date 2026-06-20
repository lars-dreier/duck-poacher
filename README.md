# ddg-search

A Node.js library for image search via DuckDuckGo. Returns image and thumbnail
URLs for a query, with optional filters for size, color, type, and more.

It calls DuckDuckGo's image-search endpoints, which are not a public, versioned
API. Response formats can change on DuckDuckGo's side and break the library.

## Install

```sh
npm install ddg-search
```

Requires Node.js 18 or newer. The package ships dual ESM/CJS and exposes both an
`import` and a `require` entry through its `exports` map.

## Usage

`DuckDuckGoApi` is the low-level client. Generate a per-session token, then run a
search — `imageSearch` returns the **raw JSON string** from DuckDuckGo, so you
parse and shape it yourself.

```ts
import { DuckDuckGoApi, ImageSearchResult, type DdgSearchOptions } from 'ddg-search';

const api = new DuckDuckGoApi();
const token = await api.generateToken('mountain landscape');

const options: DdgSearchOptions = {
  size: 'Large',
  layout: 'Square',
  safeSearch: true,
};
const rawJson = await api.imageSearch('mountain landscape', token, options);

// raw DDG shape: { results: [{ image, thumbnail }] }
const { results } = JSON.parse(rawJson) as {
  results: { image: string; thumbnail: string }[];
};

for (const { image, thumbnail } of results) {
  const result = new ImageSearchResult(thumbnail, image);
  console.log(result.imageUrl, result.thumbnailUrl);
}
```

Note the `ImageSearchResult` constructor order is `(thumbnailUrl, imageUrl)`,
while DDG returns `{ image, thumbnail }` — map accordingly.

## API

| Export | Kind | Purpose |
|--------|------|---------|
| `DuckDuckGoApi` | class | Low-level client: token generation + raw-JSON image search |
| `ImageSearchResult` | class | Immutable value object `{ thumbnailUrl, imageUrl }` |
| `DdgSearchOptions` | type | Filter options for `imageSearch` |
| `DdgTime` `DdgSize` `DdgColor` `DdgType` `DdgLayout` `DdgLicense` | type | String-union option values |

### `DuckDuckGoApi`

- **`generateToken(query: string): Promise<string>`** — fetches the DuckDuckGo
  search page and scrapes the per-session `vqd` token from it. Throws
  `Error('Unable to read token from DuckDuckGo response.')` if no token is
  found. The token must be passed to every subsequent `imageSearch` call.
- **`imageSearch(query: string, token: string, options?: DdgSearchOptions): Promise<string>`**
  — runs the image search and returns the response body verbatim as a string.
  Does not parse JSON.

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

Errors are thrown rather than swallowed. `generateToken` throws if no token can
be read from the response. HTTP failures (status ≥ 400, network errors,
timeouts) reject from the underlying request and propagate to the caller.

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
