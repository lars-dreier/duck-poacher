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

### Bot Challenges and Blocking

DuckDuckGo protects its image search with a browser-side challenge that this library does not answer. DDG tolerates
that for a burst of requests, then blocks image search for your IP for a while. Web search has not been affected so
far. Light use works fine; dozens of image searches in quick succession will get blocked.

When DDG blocks an image search, `imageSearch` throws a `BotChallengeError`. Its `reason` is DDG's category for the
challenge (e.g. `'botnet'`), `'unknown'` if DDG sent none, or `'forbidden'` if DDG rejected the request with HTTP 403.
In the 403 case the original `HttpError` is available as `cause`.

```ts
import { DuckDuckGo, type ImageSearchResult } from 'duck-poacher';

const ddg = new DuckDuckGo();

try {
  const results: ImageSearchResult[] = await ddg.imageSearch('ducks with human feet');
}
catch (error) {
  // Compare by name: `instanceof` fails if your app loads both the ESM and CJS builds.
  if (error instanceof Error && error.name === 'BotChallengeError') {
    // Blocked: back off for a while before searching again.
  }
  throw error;
}
```

A block is usually temporary. Don't retry in a tight loop, as that tends to keep it in place. Wait, and spread out
your searches. If you need search results at volume, use an official search API instead of a scraper.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and commands.

## License

ISC © Lars Dreier