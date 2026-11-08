import type { DdgSearchOptions } from './common/DdgSearchOptions.ts';
import type { DdgImageSearchOptions } from './image/DdgImageSearchOptions.ts';
import ImageSearchClient from './image/ImageSearchClient.ts';
import ImageSearchParser from './image/ImageSearchParser.ts';
import type ImageSearchResult from './image/ImageSearchResult.ts';
import WebSearchClient from './web/WebSearchClient.ts';
import WebSearchParser from './web/WebSearchParser.ts';
import type WebSearchResult from './web/WebSearchResult.ts';

/**
 * Client for image and web search via DuckDuckGo's undocumented endpoints.
 *
 * Stateless across calls: each search mints a fresh per-request token before
 * running, so a single call makes two live HTTP requests. The library's composition root: it builds the
 * clients and their parsers.
 */
export default class DuckDuckGo {
	private readonly _imageSearch: ImageSearchClient = new ImageSearchClient(new ImageSearchParser());
	private readonly _webSearch: WebSearchClient = new WebSearchClient(new WebSearchParser());

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
	 * @throws If the `vqd` token cannot be scraped from the response, or if the
	 * search response body cannot be parsed. HTTP errors are propagated.
	 */
	public async imageSearch(query: string, options?: DdgImageSearchOptions): Promise<ImageSearchResult[]> {
		const token: string = await this._imageSearch.generateToken(query, options);

		return this._imageSearch.imageSearch(query, token, options);
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

		return this._webSearch.webSearch(query, searchUrl, options);
	}
}
