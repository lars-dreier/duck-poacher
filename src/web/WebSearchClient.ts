import * as http from 'http';
import { AsyncResolvingHttpRequest, HttpMethod, HttpResponseReader } from 'node-http-toolkit';
import WebSearchParser from './WebSearchParser.ts';
import type WebSearchResult from './WebSearchResult.ts';

export default class WebSearchClient {
	private readonly TOKEN_HEADERS: http.OutgoingHttpHeaders = {
		dnt: '1'
	};

	// Modern Chrome on Windows. The browser loads d.js via a <script> tag, so this mirrors a
	// script request (sec-fetch-dest: script, no x-requested-with). accept-encoding omits zstd
	// because HttpResponseReader cannot decode it. The sec-ch-ua versions must track the user-agent.
	private readonly SEARCH_HEADERS: http.OutgoingHttpHeaders = {
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
	private readonly SEARCH_URL_REGEX = /https:\/\/links\.duckduckgo\.com\/d\.js\?[^"']+/;

	private readonly _parser = new WebSearchParser();

	public async generateToken(query: string): Promise<string> {
		const params = new URLSearchParams();
		params.append('q', query);
		params.append('ia', 'web');
		params.append('t', 'h_');

		const url: string = `https://duckduckgo.com/?${params.toString()}`;
		const data: string = await this.get(url, this.TOKEN_HEADERS);
		const match: RegExpMatchArray | null = data.match(this.SEARCH_URL_REGEX);
		const searchUrl: string | undefined = match?.[0];

		if (searchUrl == null) {
			throw new Error('Unable to read search URL from DuckDuckGo response.');
		}

		return searchUrl;
	}

	public async webSearch(query: string, searchUrl: string): Promise<WebSearchResult[]> {
		const responseText: string = await this.get(searchUrl, this.SEARCH_HEADERS);

		return this._parser.parse(responseText);
	}

	private async get(url: string, headers: http.OutgoingHttpHeaders): Promise<string> {
		const request = new AsyncResolvingHttpRequest(url, HttpMethod.GET, headers);
		const response: http.IncomingMessage = await request.resolve();
		const reader = new HttpResponseReader();

		return reader.readData(response);
	}
}
