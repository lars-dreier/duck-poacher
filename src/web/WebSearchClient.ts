import type * as http from 'node:http';
import type DdgHttpClient from '../common/DdgHttpClient.ts';
import type { DdgSearchOptions } from '../common/DdgSearchOptions.ts';
import type WebSearchParser from './WebSearchParser.ts';
import type WebSearchResult from './WebSearchResult.ts';

/**
 * Talks to DuckDuckGo's web endpoint: scrapes the signed `links.duckduckgo.com/d.js` URL from the search page, then
 * fetches it with browser-like script headers. The safe search level is fixed into that URL when it is scraped.
 */
export default class WebSearchClient {
	private static readonly TOKEN_HEADERS: http.OutgoingHttpHeaders = {
		dnt: '1'
	};

	// Modern Chrome on Windows. The browser loads d.js via a <script> tag, so this mirrors a
	// script request (sec-fetch-dest: script, no x-requested-with). accept-encoding omits zstd
	// because HttpResponseReader cannot decode it. The sec-ch-ua versions must track the user-agent.
	private static readonly SEARCH_HEADERS: http.OutgoingHttpHeaders = {
		dnt: '1',
		'user-agent':
			'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
		accept: '*/*',
		'accept-language': 'en-US,en;q=0.9',
		'accept-encoding': 'gzip, deflate, br',
		referer: 'https://duckduckgo.com/',
		'sec-ch-ua': '"Chromium";v="133", "Google Chrome";v="133", "Not(A:Brand";v="24"',
		'sec-ch-ua-mobile': '?0',
		'sec-ch-ua-platform': '"Windows"',
		'sec-fetch-dest': 'script',
		'sec-fetch-mode': 'no-cors',
		'sec-fetch-site': 'same-site'
	};

	// The web endpoint gates on a signed `dp` blob that only DDG's page JS can mint, so the full
	// d.js URL is scraped from the page rather than built from a vqd (unlike the image client).
	private static readonly SEARCH_URL_REGEX: RegExp = /https:\/\/links\.duckduckgo\.com\/d\.js\?[^"']+/;

	public constructor(
		private readonly _parser: WebSearchParser,
		private readonly _httpClient: DdgHttpClient,
	) {}

	// The safe search level is baked into the signed d.js URL at this step, so the cookie must be
	// sent here; it cannot be applied to the scraped URL afterwards.
	public async generateToken(query: string, options?: DdgSearchOptions): Promise<string> {
		const params = new URLSearchParams();
		params.append('q', query);
		params.append('ia', 'web');
		params.append('t', 'h_');

		const url: string = `https://duckduckgo.com/?${params.toString()}`;
		const data: string = await this._httpClient.get(
			url,
			WebSearchClient.TOKEN_HEADERS,
			options
		);
		const match: RegExpMatchArray | null = data.match(WebSearchClient.SEARCH_URL_REGEX);
		const searchUrl: string | undefined = match?.[0];

		if (searchUrl == null) {
			throw new Error('Unable to read search URL from DuckDuckGo response.');
		}

		return searchUrl;
	}

	// A browser sends the cookie with the d.js request too, so mirror that.
	public async webSearch(query: string, searchUrl: string, options?: DdgSearchOptions): Promise<WebSearchResult[]> {
		const responseText: string = await this._httpClient.get(
			searchUrl,
			WebSearchClient.SEARCH_HEADERS,
			options
		);

		return this._parser.parse(responseText);
	}
}
