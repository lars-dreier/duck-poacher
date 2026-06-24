import ImageSearchClient, { type DdgSearchOptions } from './image/ImageSearchClient.ts';
import type ImageSearchResult from './image/ImageSearchResult.ts';
import WebSearchClient from './web/WebSearchClient.ts';
import type WebSearchResult from './web/WebSearchResult.ts';

/**
 * Client for image and web search via DuckDuckGo's undocumented endpoints.
 *
 * Stateless across calls: each search mints a fresh per-request token before
 * running, so a single call makes two live HTTP requests. There is no built-in
 * multi-query, dedupe, or result cap.
 */
export default class DuckDuckGo {
	private readonly _imageSearch = new ImageSearchClient();

	private readonly _webSearch = new WebSearchClient();

	/**
	 * Runs an image search.
	 *
	 * Mints a per-request `vqd` token, then queries the image endpoint and
	 * returns the parsed results.
	 *
	 * @param query - The search term.
	 * @param options - Optional filters (size, color, type, layout, safe search, ...).
	 * @returns The parsed image results.
	 * @throws If the `vqd` token cannot be scraped from the response, or if the
	 * search response body cannot be parsed. HTTP errors are propagated.
	 */
	public async imageSearch(query: string, options?: DdgSearchOptions): Promise<ImageSearchResult[]> {
		const token: string = await this._imageSearch.generateToken(query);

		return this._imageSearch.imageSearch(query, token, options);
	}

	/**
	 * Runs a web search.
	 *
	 * Scrapes a per-request signed search URL from DuckDuckGo's page, then
	 * queries it and returns the parsed results. Takes no options.
	 *
	 * @param query - The search term.
	 * @returns The parsed web results.
	 * @throws If the signed search URL cannot be scraped from the response, or
	 * if the search response body cannot be parsed. HTTP errors are propagated.
	 */
	public async webSearch(query: string): Promise<WebSearchResult[]> {
		const searchUrl: string = await this._webSearch.generateToken(query);

		return this._webSearch.webSearch(query, searchUrl);
	}
}
