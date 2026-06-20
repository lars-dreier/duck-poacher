import ImageSearchResult from './ImageSearchResult.ts';

export default class ImageSearchParser {
	public parse(responseText: string): ImageSearchResult[] {
		const jsonObject: unknown = JSON.parse(responseText);
		const parsedResults: DdgResult[] = (jsonObject as DdgResponse).results;
		const searchResults: ImageSearchResult[] = [];

		for (const result of parsedResults) {
			searchResults.push(new ImageSearchResult(result.thumbnail, result.image));
		}

		return searchResults;
	}
}

interface DdgResponse {
	results: DdgResult[];
}

interface DdgResult {
	image: string;
	thumbnail: string;
}
