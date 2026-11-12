import DdgHttpClient from './common/DdgHttpClient.ts';
import type { DdgSearchOptions } from './common/DdgSearchOptions.ts';
import type { DdgImageSearchOptions } from './image/DdgImageSearchOptions.ts';
import ImageSearchClient from './image/ImageSearchClient.ts';
import ImageSearchParser from './image/ImageSearchParser.ts';
import type ImageSearchResult from './image/ImageSearchResult.ts';
import ImageSearchSession from './image/ImageSearchSession.ts';
import WebSearchClient from './web/WebSearchClient.ts';
import WebSearchParser from './web/WebSearchParser.ts';
import type WebSearchResult from './web/WebSearchResult.ts';

/**
 * Client for image and web search via DuckDuckGo's undocumented endpoints.
 *
 * Stateless across calls: each search mints a fresh per-request token before
 * running, so a single call makes two live HTTP requests. To run several image searches for one query on a single
 * token, use `createImageSearchSession`. The library's composition root: it builds the clients and their dependencies.
 */
export default class DuckDuckGo {
	private readonly _imageSearch: ImageSearchClient = new ImageSearchClient(
		new ImageSearchParser(),
		new DdgHttpClient()
	);
	private readonly _webSearch: WebSearchClient = new WebSearchClient(new WebSearchParser(), new DdgHttpClient());

	/**
	 * Runs an image search.
	 *
	 * Mints a per-request `vqd` token, then queries the image endpoint and
	 * returns the parsed results.
	 *
	 * @param query - The search term.
	 * @param options - Optional filters (size, color, type, layout, ...) and safe search level
	 * (DDG's moderate default when omitted).
	 * @returns The parsed image results.
	 * @throws `BotChallengeError` if DuckDuckGo answers with a bot challenge or rejects the search with HTTP 403
	 * (`reason` `forbidden`). Also throws if the `vqd` token
	 * cannot be scraped from the response, or if the search response body cannot be parsed. HTTP errors are
	 * propagated.
	 */
	public async imageSearch(query: string, options?: DdgImageSearchOptions): Promise<ImageSearchResult[]> {
		const session: ImageSearchSession = await this.createImageSearchSession(query);

		return session.search(options);
	}

	/**
	 * Mints a `vqd` token for an image query and returns a session that reuses it for every search.
	 *
	 * Use it to run several searches for the same query with different filters or safe search levels: each search
	 * then costs one request instead of two, which keeps bursts below the point where DuckDuckGo starts sending bot
	 * challenges.
	 *
	 * @param query - The search term.
	 * @returns A session whose `search` takes the filters and safe search level per search.
	 * @throws If the `vqd` token cannot be scraped from the response. HTTP errors are propagated.
	 */
	public async createImageSearchSession(query: string): Promise<ImageSearchSession> {
		const token: string = await this._imageSearch.generateToken(query);

		return new ImageSearchSession(
			this._imageSearch,
			query,
			token
		);
	}

	/**
	 * Runs a web search.
	 *
	 * Scrapes a per-request signed search URL from DuckDuckGo's page, then
	 * queries it and returns the parsed results.
	 *
	 * @param query - The search term.
	 * @param options - Optional safe search level (DDG's moderate default when omitted).
	 * @returns The parsed web results.
	 * @throws If the signed search URL cannot be scraped from the response, or
	 * if the search response body cannot be parsed. HTTP errors are propagated.
	 */
	public async webSearch(query: string, options?: DdgSearchOptions): Promise<WebSearchResult[]> {
		const searchUrl: string = await this._webSearch.generateToken(query, options);

		return this._webSearch.webSearch(query, searchUrl);
	}
}
