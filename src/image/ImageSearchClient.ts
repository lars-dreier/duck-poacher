import { HttpError } from 'node-http-toolkit';
import type * as http from 'node:http';
import BotChallengeError from '../common/BotChallengeError.ts';
import type DdgHttpClient from '../common/DdgHttpClient.ts';
import type { DdgSearchOptions } from '../common/DdgSearchOptions.ts';
import GlobalSearchOptions from '../common/GlobalSearchOptions.ts';
import type { DdgImageSearchOptions } from './DdgImageSearchOptions.ts';
import type ImageSearchParser from './ImageSearchParser.ts';
import type ImageSearchResult from './ImageSearchResult.ts';

/**
 * Talks to DuckDuckGo's image endpoint: scrapes a per-query `vqd` token from the search page, then fetches `i.js`
 * with the token, the positional `f` filter string and the safe search level. A 403 from `i.js` is DDG blocking the
 * client, so it is reported as a `BotChallengeError` like a `challenge` body.
 */
export default class ImageSearchClient {
	// Order is important
	private static readonly OPTION_NAMES: Exclude<keyof DdgImageSearchOptions, keyof DdgSearchOptions>[] = [
		'time',
		'size',
		'color',
		'type',
		'layout',
		'license'
	];

	// Firefox on macOS, as captured from the browser. accept-encoding omits zstd because HttpResponseReader cannot
	// decode it.
	private static readonly BROWSER_HEADERS: http.OutgoingHttpHeaders = {
		dnt: '1',
		'sec-gpc': '1',
		'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:159.0) Gecko/20100101 Firefox/159.0',
		'accept-language': 'en-US,en;q=0.9',
		'accept-encoding': 'gzip, deflate, br'
	};

	// A top-level page load.
	private static readonly TOKEN_HEADERS: http.OutgoingHttpHeaders = {
		...ImageSearchClient.BROWSER_HEADERS,
		accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
		'upgrade-insecure-requests': '1',
		'sec-fetch-dest': 'document',
		'sec-fetch-mode': 'navigate',
		'sec-fetch-site': 'none',
		'sec-fetch-user': '?1'
	};

	// The page's fetch of i.js.
	private static readonly SEARCH_HEADERS: http.OutgoingHttpHeaders = {
		...ImageSearchClient.BROWSER_HEADERS,
		accept: '*/*',
		referer: 'https://duckduckgo.com/',
		'sec-fetch-dest': 'empty',
		'sec-fetch-mode': 'cors',
		'sec-fetch-site': 'same-origin'
	};

	private static readonly TOKEN_REGEX: RegExp = /vqd=(?<vqd>[\d-]+)/;

	private static readonly FORBIDDEN_STATUS: number = 403;

	private static readonly FORBIDDEN_REASON: string = 'forbidden';

	public constructor(
		private readonly _parser: ImageSearchParser,
		private readonly _httpClient: DdgHttpClient,
	) {}

	public async generateToken(query: string, options?: DdgSearchOptions): Promise<string> {
		const params = new URLSearchParams();
		params.append('q', query);
		params.append('atb', 'v299-1');
		params.append('iar', 'images');
		params.append('iax', 'images');
		params.append('ia', 'images');

		const url: string = `https://duckduckgo.com/?${params.toString()}`;
		const data: string = await this._httpClient.get(
			url,
			ImageSearchClient.TOKEN_HEADERS,
			options
		);
		const match: RegExpMatchArray | null = data.match(ImageSearchClient.TOKEN_REGEX);
		const vqd: string | undefined = match?.groups?.['vqd'];

		if (vqd == null) {
			throw new Error('Unable to read token from DuckDuckGo response.');
		}

		return vqd;
	}

	public async imageSearch(
		query: string,
		token: string,
		options?: DdgImageSearchOptions,
	): Promise<ImageSearchResult[]> {
		const searchOptions: DdgImageSearchOptions = options ?? {};
		const url: string = this.createSearchUrl(
			query,
			token,
			searchOptions
		);
		const responseText: string = await this.fetchResults(url, searchOptions);

		return this._parser.parse(responseText);
	}

	// DDG blocks i.js either with a `challenge` body or with a plain-text 403; callers get the same error for both.
	private async fetchResults(url: string, options: DdgImageSearchOptions): Promise<string> {
		try {
			return await this._httpClient.get(
				url,
				ImageSearchClient.SEARCH_HEADERS,
				options
			);
		}
		catch (error: unknown) {
			if (error instanceof HttpError && error.statusCode === ImageSearchClient.FORBIDDEN_STATUS) {
				throw new BotChallengeError(ImageSearchClient.FORBIDDEN_REASON, { cause: error });
			}

			throw error;
		}
	}

	private createSearchUrl(query: string, token: string, options: DdgImageSearchOptions): string {
		const params = new URLSearchParams();
		params.append('l', 'us-en');
		params.append('o', 'json');
		params.append('q', query);
		params.append('vqd', token);
		params.append('f', this.createImageSearchOptionsHeader(options));
		// i.js also carries the level as its `p` parameter, alongside the `p` cookie GlobalSearchOptions sets.
		params.append('p', new GlobalSearchOptions(options).safeSearchParam);

		return `https://duckduckgo.com/i.js?${params.toString()}`;
	}

	private createImageSearchOptionsHeader(options: DdgImageSearchOptions): string {
		const optionValues: string[] = [];

		for (const optionName of ImageSearchClient.OPTION_NAMES) {
			const optionValue: string | undefined = options[optionName];

			if (optionValue == null) {
				optionValues.push('');
			}
			else {
				optionValues.push(`${optionName}:${optionValue}`);
			}
		}

		return optionValues.join(',');
	}
}
