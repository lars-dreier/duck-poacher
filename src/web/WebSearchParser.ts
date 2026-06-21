import WebSearchResult from './WebSearchResult.ts';

export default class WebSearchParser {
	private readonly RESULTS_MARKER: string = "DDG.pageLayout.load('d',";

	public parse(responseText: string): WebSearchResult[] {
		const entries: DdgWebResult[] = this.extractResults(responseText);
		const searchResults: WebSearchResult[] = [];

		for (const entry of entries) {
			if (entry.t == null || entry.u == null) {
				continue;
			}

			searchResults.push(new WebSearchResult(entry.t, entry.u, entry.a ?? ''));
		}

		return searchResults;
	}

	private extractResults(responseText: string): DdgWebResult[] {
		const markerIndex: number = responseText.indexOf(this.RESULTS_MARKER);

		if (markerIndex < 0) {
			throw new Error('Unable to read results from DuckDuckGo response.');
		}

		const arrayStart: number = responseText.indexOf('[', markerIndex);
		const arrayEnd: number = this.findMatchingBracket(responseText, arrayStart);
		const arrayLiteral: string = responseText.slice(arrayStart, arrayEnd + 1);

		return JSON.parse(arrayLiteral) as DdgWebResult[];
	}

	private findMatchingBracket(text: string, openIndex: number): number {
		let depth: number = 0;
		let inString: boolean = false;

		for (let i: number = openIndex; i < text.length; i++) {
			const char: string = text[i] as string;

			if (inString) {
				if (char === '\\') {
					i++;
				}
				else if (char === '"') {
					inString = false;
				}

				continue;
			}

			if (char === '"') {
				inString = true;
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

interface DdgWebResult {
	t?: string;
	u?: string;
	a?: string;
	n?: string;
}
