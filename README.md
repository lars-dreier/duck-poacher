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

`DdgClient` is the client. Construct one and call `imageSearch` — it returns a
parsed `ImageSearchResult[]` (objects with `imageUrl` / `thumbnailUrl`, not a raw
string) and manages the per-session `vqd` token for you, so there is no token to
pass.

```ts
import { DdgClient, type DdgSearchOptions, type ImageSearchResult } from 'ddg-search';

const ddg = new DdgClient();

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

Each call makes two live requests (mint the token, then search). There is no
built-in multi-query, dedupe, or cap.

## API

| Export | Kind | Purpose |
|--------|------|---------|
| `DdgClient` | class | The client: `imageSearch(query, options?)`, token managed internally |
| `ImageSearchResult` | class | Immutable value object `{ thumbnailUrl, imageUrl }` |
| `DdgSearchOptions` | type | Filter options for `imageSearch` |
| `DdgTime` `DdgSize` `DdgColor` `DdgType` `DdgLayout` `DdgLicense` | type | String-union option values |

### `DdgClient`

- **`imageSearch(query: string, options?: DdgSearchOptions): Promise<ImageSearchResult[]>`**
  — generates a per-session `vqd` token, runs the image search, and returns the
  parsed results. Throws `Error('Unable to read token from DuckDuckGo response.')`
  if the token cannot be scraped; a malformed response body throws.

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
