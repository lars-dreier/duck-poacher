import * as http from 'http';
import { AsyncResolvingHttpRequest, HttpMethod, HttpResponseReader } from 'node-http-toolkit';
import GlobalSearchOptions, { type DdgSearchOptions, SafeSearchParam } from '../common/GlobalSearchOptions.ts';
import ImageSearchParser from './ImageSearchParser.ts';
import type ImageSearchResult from './ImageSearchResult.ts';

/** Time window the image must fall within. */
export type DdgTime = 'Day' | 'Week' | 'Month';
/** Image size bucket. */
export type DdgSize = 'Small' | 'Medium' | 'Large' | 'Wallpaper';
/** Color filter. */
export type DdgColor = 'color' | 'Monochrome';
/** Image kind. */
export type DdgType = 'photo' | 'clipart' | 'gif' | 'transparent' | 'line';
/** Aspect-ratio layout. */
export type DdgLayout = 'Square' | 'Tall' | 'Wide';
/** Usage-rights filter. */
export type DdgLicense = 'Any' | 'Public';

/** Options for `DuckDuckGo.imageSearch`: the shared options plus image filters. All fields are optional. */
export interface DdgImageSearchOptions extends DdgSearchOptions {
	/** Restrict to images from the last day, week, or month. */
	time?: DdgTime;
	/** Restrict to a size bucket. */
	size?: DdgSize;
	/** Restrict to color or monochrome. */
	color?: DdgColor;
	/** Restrict to an image kind (photo, clipart, gif, ...). */
	type?: DdgType;
	/** Restrict to an aspect-ratio layout. */
	layout?: DdgLayout;
	/** Restrict by usage rights. */
	license?: DdgLicense;
}

export default class ImageSearchClient {
	// Order is important
	private readonly OPTION_NAMES: string[] = ['time', 'size', 'color', 'type', 'layout', 'license'];

	private readonly TOKEN_HEADERS: http.OutgoingHttpHeaders = {
		dnt: '1'
	};

	private readonly SEARCH_HEADERS: http.OutgoingHttpHeaders = {
		dnt: '1',
		'accept-encoding': 'gzip, deflate, sdch, br',
		'x-requested-with': 'XMLHttpRequest',
		'accept-language': 'en-GB,en-US;q=0.8,en;q=0.6,ms;q=0.4',
		'user-agent':
			'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/55.0.2883.87 Safari/537.36',
		accept: 'application/json, text/javascript, */*; q=0.01',
		referer: 'https://duckduckgo.com/',
		authority: 'duckduckgo.com'
	};

	private static readonly TOKEN_REGEX: RegExp = /vqd=(?<vqd>[\d-]+)/;

	private readonly _parser = new ImageSearchParser();

	public async generateToken(query: string, options?: DdgSearchOptions): Promise<string> {
		const params = new URLSearchParams();
		params.append('q', query);
		params.append('atb', 'v299-1');
		params.append('iar', 'images');
		params.append('iax', 'images');
		params.append('ia', 'images');

		const url: string = `https://duckduckgo.com/?${params.toString()}`;
		const data: string = await this.get(url, new GlobalSearchOptions(options).apply(ImageSearchClient.TOKEN_HEADERS));
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
		const url: string = this.createSearchUrl(query, token, searchOptions);
		const responseText: string = await this.get(
			url,
			new GlobalSearchOptions(searchOptions).apply(ImageSearchClient.SEARCH_HEADERS)
		);

		return this._parser.parse(responseText);
	}

	private async get(url: string, headers: http.OutgoingHttpHeaders): Promise<string> {
		const request = new AsyncResolvingHttpRequest(url, HttpMethod.GET, headers);
		const response: http.IncomingMessage = await request.resolve();
		const reader = new HttpResponseReader();

		return reader.readData(response);
	}

	private createSearchUrl(query: string, token: string, options: DdgImageSearchOptions): string {
		const params = new URLSearchParams();
		params.append('l', 'de-de');
		params.append('o', 'json');
		params.append('q', query);
		params.append('vqd', token);
		params.append('f', this.createImageSearchOptionsHeader(options));
		// i.js also carries the level as its `p` parameter, alongside the `p` cookie GlobalSearchOptions sets.
		params.append('p', SafeSearchParam[options.safeSearch ?? 'Moderate']);

		return `https://duckduckgo.com/i.js?${params.toString()}`;
	}

	private createImageSearchOptionsHeader(options: DdgImageSearchOptions): string {
		const optionValues: string[] = [];

		for (const optionName of this.OPTION_NAMES) {
			const optionValue: string | undefined = options[optionName as keyof DdgImageSearchOptions]?.toString();

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
