import ImageSearchResult from './ImageSearchResult.ts';

/**
 * Parses an `i.js` JSON body into `ImageSearchResult`s. Throws on a body that is not JSON or lacks `results`.
 */
export default class ImageSearchParser {
	public parse(responseText: string): ImageSearchResult[] {
		const jsonObject: unknown = JSON.parse(responseText);
		const parsedResults: IDdgResult[] = (jsonObject as IDdgResponse).results;
		const searchResults: ImageSearchResult[] = [];

		for (const result of parsedResults) {
			searchResults.push(new ImageSearchResult(result.thumbnail, result.image));
		}

		return searchResults;
	}
}

interface IDdgResponse {
	results: IDdgResult[];
}

interface IDdgResult {
	image: string;
	thumbnail: string;
}
