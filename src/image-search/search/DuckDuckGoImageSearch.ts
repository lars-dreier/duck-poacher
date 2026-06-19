import DuckDuckGoApi, { type DdgSearchOptions } from '../api/DuckDuckGoApi.ts';
import type IImageSearchEngine from '../types/IImageSearchEngine.ts';
import ImageSearchResult from '../types/ImageSearchResult.ts';

export default class DuckDuckGoImageSearchEngine implements IImageSearchEngine {
	private readonly _api = new DuckDuckGoApi();

	private readonly SEARCH_OPTIONS: PrioritizedSearchOption[] = [
		{ options: { size: 'Large', layout: 'Square' }, priority: 0 },
		{ options: { layout: 'Square' }, priority: 5 },
		{ options: { size: 'Large' }, priority: 10 },
		{ options: {}, priority: 20 }
	];

	public async search(query: string): Promise<ImageSearchResult[]> {
		const token: string = await this._api.generateToken(query);
		const prioritizedResults: PrioritizedResult[] = [];

		for (const option of this.SEARCH_OPTIONS) {
			const queryResults: PrioritizedResult[] = await this.getPrioritizedResults(
				query,
				token,
				option
			);
			prioritizedResults.push(...queryResults);
		}

		prioritizedResults.sort((a, b) => a.priority - b.priority);

		const resultsByImageUrl = new Map<string, ImageSearchResult>();

		for (const prioritized of prioritizedResults) {
			if (resultsByImageUrl.size >= 100) {
				break;
			}
			if (resultsByImageUrl.has(prioritized.result.imageUrl)) {
				continue;
			}
			resultsByImageUrl.set(prioritized.result.imageUrl, prioritized.result);
		}

		return Array.from(resultsByImageUrl.values());
	}

	private async getPrioritizedResults(
		query: string,
		token: string,
		prioritizedOptions: PrioritizedSearchOption,
	): Promise<PrioritizedResult[]> {
		const response: string = await this._api.imageSearch(query, token, prioritizedOptions.options);
		const results: ImageSearchResult[] = this.parseResponse(response);

		const prioritizedResults: PrioritizedResult[] = [];
		for (let i = 0; i < results.length; i++) {
			const result: ImageSearchResult | undefined = results[i];
			if (result == null) {
				continue;
			}

			prioritizedResults.push({
				result,
				priority: prioritizedOptions.priority + i
			});
		}

		return prioritizedResults;
	}

	private parseResponse(responseText: string): ImageSearchResult[] {
		const jsonObject: unknown = JSON.parse(responseText);
		const parsedResults: DdgResult[] = (jsonObject as DdgResponse).results;
		const searchResults: ImageSearchResult[] = [];

		for (const result of parsedResults) {
			searchResults.push(new ImageSearchResult(result.thumbnail, result.image));
		}

		return searchResults;
	}
}

interface PrioritizedSearchOption {
	options: DdgSearchOptions;
	priority: number;
}

interface PrioritizedResult {
	result: ImageSearchResult;
	priority: number;
}

interface DdgResponse {
	results: DdgResult[];
}

interface DdgResult {
	image: string;
	thumbnail: string;
}
