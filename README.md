# duck-poacher

A Node.js library for image and web search via DuckDuckGo.

## The Basics

### Web Search
Returns the title, URL, and description of each result.

### Image Search
Returns image and thumbnail URLs for a query, with optional filters for size, color, type, etc.

### Note
As this is a scraper using a basically undocumented API, it can theoretically break any moment DDG change their structure.
This project was embedded in another project of mine (before I turned it into a package) where it has been working since ~2022.
Currently, (besides also using this) I will manually run tests irregularly and in case something breaks, I will try to fix it ASAP.

## Install

```sh
npm install duck-poacher
```

Requires Node.js 18 or newer. The package ships dual ESM/CJS.

## Usage

`DuckDuckGo` is the client. Construct one to get started. Token generation is automatically handled per request meaning
each call makes two live requests (mint the token, then search). There is no built-in multi-query, dedupe, or cap.

### Web Search

For web search, call `webSearch` — it returns a parsed `WebSearchResult[]` (objects with `title` / `url` / `description`).
As of now, it takes no options.

```ts
import { DuckDuckGo, type WebSearchResult } from 'duck-poacher';

const ddg = new DuckDuckGo();

const results: WebSearchResult[] = await ddg.webSearch('Node.js best practices');

for (const result of results) {
  console.log(result.title, result.url, result.description);
}
```

### Image Search

For image search, call `imageSearch` which will then return a parsed `ImageSearchResult[]` (objects with `imageUrl` and `thumbnailUrl`).

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

The client will throw errors in case parsing fails at any stage (Token generation, search results).
HTTP errors are also propagated.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and commands.

## License

ISC © Lars Dreier
