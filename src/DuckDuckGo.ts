import ImageSearchClient, { type DdgSearchOptions } from './image/ImageSearchClient.ts';
import type ImageSearchResult from './image/ImageSearchResult.ts';
import WebSearchClient from './web/WebSearchClient.ts';
import type WebSearchResult from './web/WebSearchResult.ts';

export default class DuckDuckGo {
	private readonly _imageSearch = new ImageSearchClient();

	private readonly _webSearch = new WebSearchClient();

	public async imageSearch(query: string, options?: DdgSearchOptions): Promise<ImageSearchResult[]> {
		const token: string = await this._imageSearch.generateToken(query);

		return this._imageSearch.imageSearch(query, token, options);
	}

	public async webSearch(query: string): Promise<WebSearchResult[]> {
		const searchUrl: string = await this._webSearch.generateToken(query);

		return this._webSearch.webSearch(query, searchUrl);
	}
}
