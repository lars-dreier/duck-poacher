import BotChallengeError from '../common/BotChallengeError.ts';
import ImageSearchResult from './ImageSearchResult.ts';

/**
 * Parses an `i.js` JSON body into `ImageSearchResult`s.
 */
export default class ImageSearchParser {
	/**
	 * @throws `BotChallengeError` if DuckDuckGo sent a bot challenge in place of results. Also throws if the body is
	 * not JSON or lacks `results`.
	 */
	public parse(responseText: string): ImageSearchResult[] {
		const response: IDdgResponse = JSON.parse(responseText) as IDdgResponse;

		if (response.challenge != null) {
			throw new BotChallengeError(response.challenge.cc ?? 'unknown');
		}

		const parsedResults: IDdgResult[] = response.results;
		const searchResults: ImageSearchResult[] = [];

		for (const result of parsedResults) {
			searchResults.push(new ImageSearchResult(result.thumbnail, result.image));
		}

		return searchResults;
	}
}

interface IDdgResponse {
	results: IDdgResult[];
	// Sent in place of `results` when DDG suspects a bot.
	challenge?: IDdgChallenge;
}

interface IDdgChallenge {
	cc?: string;
}

interface IDdgResult {
	image: string;
	thumbnail: string;
}
