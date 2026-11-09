import WebSearchResult from './WebSearchResult.ts';

/**
 * Parses a `d.js` response into `WebSearchResult`s. The results are an array literal embedded in a
 * `DDG.pageLayout.load('d', [...])` call, found by its marker and a string-aware bracket scan. Entries without a
 * title or URL are skipped; a missing marker or unbalanced array throws.
 */
export default class WebSearchParser {
	private static readonly RESULTS_MARKER: string = "DDG.pageLayout.load('d',";

	public parse(responseText: string): WebSearchResult[] {
		const entries: IDdgWebResult[] = this.extractResults(responseText);
		const searchResults: WebSearchResult[] = [];

		for (const entry of entries) {
			if (entry.t == null || entry.u == null) {
				continue;
			}

			searchResults.push(
				new WebSearchResult(
					entry.t,
					entry.u,
					entry.a ?? ''
				)
			);
		}

		return searchResults;
	}

	private extractResults(responseText: string): IDdgWebResult[] {
		const markerIndex: number = responseText.indexOf(WebSearchParser.RESULTS_MARKER);

		if (markerIndex < 0) {
			throw new Error('Unable to read results from DuckDuckGo response.');
		}

		const arrayStart: number = responseText.indexOf('[', markerIndex);
		const arrayEnd: number = this.findMatchingBracket(responseText, arrayStart);
		const arrayLiteral: string = responseText.slice(arrayStart, arrayEnd + 1);

		return JSON.parse(arrayLiteral) as IDdgWebResult[];
	}

	private findMatchingBracket(text: string, openIndex: number): number {
		let depth: number = 0;
		let isInString: boolean = false;

		for (let i: number = openIndex; i < text.length; i++) {
			const char: string = text[i] as string;

			if (isInString) {
				if (char === '\\') {
					i++;
				}
				else if (char === '"') {
					isInString = false;
				}

				continue;
			}

			if (char === '"') {
				isInString = true;
			}
			else if (char === '[') {
				depth++;
			}
			else if (char === ']') {
				depth--;

				if (depth === 0) {
					return i;
				}
			}
		}

		throw new Error('Unable to read results from DuckDuckGo response.');
	}
}

interface IDdgWebResult {
	t?: string;
	u?: string;
	a?: string;
	n?: string;
}
