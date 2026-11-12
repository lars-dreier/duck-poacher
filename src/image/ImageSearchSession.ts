import type { DdgImageSearchOptions } from './DdgImageSearchOptions.ts';
import type ImageSearchClient from './ImageSearchClient.ts';
import type ImageSearchResult from './ImageSearchResult.ts';

/**
 * One image query with its `vqd` token, minted once and reused by every search, so several searches for the same
 * query cost one token request in total. DuckDuckGo issues one token per query, independent of filters and safe search
 * level, so both may differ from search to search.
 */
export default class ImageSearchSession {
	public constructor(
		private readonly _client: ImageSearchClient,
		/** The search term every search in this session runs. */
		public readonly query: string,
		private readonly _token: string,
	) {}

	/**
	 * Runs an image search for the session's query, reusing its token.
	 *
	 * @param options - Optional filters (size, color, type, layout, ...) and safe search level (DDG's moderate default
	 * when omitted) for this search only.
	 * @returns The parsed image results.
	 * @throws `BotChallengeError` if DuckDuckGo answers with a bot challenge or rejects the search with HTTP 403
	 * (`reason` `forbidden`). Also throws if the search response body cannot be parsed. HTTP errors are propagated.
	 */
	public async search(options?: DdgImageSearchOptions): Promise<ImageSearchResult[]> {
		return this._client.imageSearch(
			this.query,
			this._token,
			options
		);
	}
}
