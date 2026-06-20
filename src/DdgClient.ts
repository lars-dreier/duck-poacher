import ImageSearchClient, { type DdgSearchOptions } from './image/ImageSearchClient.ts';
import type ImageSearchResult from './image/ImageSearchResult.ts';

export default class DdgClient {
	private readonly _imageSearch = new ImageSearchClient();

	public async imageSearch(query: string, options?: DdgSearchOptions): Promise<ImageSearchResult[]> {
		const token: string = await this._imageSearch.generateToken(query);

		return this._imageSearch.imageSearch(query, token, options);
	}
}
