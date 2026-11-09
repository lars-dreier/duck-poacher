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
Currently, I will manually run tests irregularly and in case something breaks, I will try to fix it ASAP.

## Install

```sh
npm install duck-poacher
```

Requires Node.js 18 or newer. The package ships dual ESM/CJS.

## Usage

`DuckDuckGo` is the client. Construct one to get started. Token generation is automatically handled per request meaning
each call makes two live requests (mint the token, then search). There is no built-in multi-query, dedupe, or cap.

### Web Search

`webSearch` returns a parsed `WebSearchResult[]` (objects with `title` / `url` / `description`).
It optionally takes `DdgSearchOptions`, the options every search accepts (see [Safe Search](#safe-search)).

```ts
import { DuckDuckGo, type WebSearchResult } from 'duck-poacher';

const ddg = new DuckDuckGo();

const results: WebSearchResult[] = await ddg.webSearch('how to stop using node', { safeSearch: 'Strict' });

for (const result of results) {
  console.log(result.title, result.url, result.description);
}
```

### Image Search

For image search, call `imageSearch` which will then return a parsed `ImageSearchResult[]` (objects with `imageUrl` and `thumbnailUrl`).

```ts
import { DuckDuckGo, type DdgImageSearchOptions, type ImageSearchResult } from 'duck-poacher';

const ddg = new DuckDuckGo();

const options: DdgImageSearchOptions = {
  size: 'Large',
  layout: 'Square',
  safeSearch: 'Strict',
};
const results: ImageSearchResult[] = await ddg.imageSearch('ducks with human feet', options);

for (const result of results) {
  console.log(result.imageUrl, result.thumbnailUrl);
}
```

### Safe Search

Safe search is a DuckDuckGo-wide setting, so both `webSearch` and `imageSearch` accept it through `DdgSearchOptions`
(`DdgImageSearchOptions` extends it with the image filters). `safeSearch` is `'Off'`, `'Moderate'` or `'Strict'`; when
omitted, DuckDuckGo's own default (`'Moderate'`) applies.

## Error Handling

The client will throw errors in case parsing fails at any stage (Token generation, search results).
HTTP errors are also propagated.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and commands.

## License

ISC © Lars Dreier