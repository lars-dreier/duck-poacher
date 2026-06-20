import * as http from 'http';
import { AsyncResolvingHttpRequest, HttpMethod, HttpResponseReader } from 'node-http-toolkit';

export type DdgTime = 'Day' | 'Week' | 'Month';
export type DdgSize = 'Small' | 'Medium' | 'Large' | 'Wallpaper';
export type DdgColor = 'color' | 'Monochrome';
export type DdgType = 'photo' | 'clipart' | 'gif' | 'transparent' | 'line';
export type DdgLayout = 'Square' | 'Tall' | 'Wide';
export type DdgLicense = 'Any' | 'Public';

export interface DdgSearchOptions {
	time?: DdgTime;
	size?: DdgSize;
	color?: DdgColor;
	type?: DdgType;
	layout?: DdgLayout;
	license?: DdgLicense;
	safeSearch?: boolean;
}

export default class DuckDuckGoApi {
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

	private readonly TOKEN_REGEX = /vqd=(?<vqd>[\d-]+)/;

	public async generateToken(query: string): Promise<string> {
		const params = new URLSearchParams();
		params.append('q', query);
		params.append('atb', 'v299-1');
		params.append('iar', 'images');
		params.append('iax', 'images');
		params.append('ia', 'images');

		const url: string = `https://duckduckgo.com/?${params.toString()}`;
		const request = new AsyncResolvingHttpRequest(url, HttpMethod.GET, this.TOKEN_HEADERS);
		const response: http.IncomingMessage = await request.resolve();
		const reader = new HttpResponseReader();
		const data: string = await reader.readData(response);
		const match: RegExpMatchArray | null = data.match(this.TOKEN_REGEX);
		const vqd: string | undefined = match?.groups?.['vqd'];

		if (vqd == null) {
			throw new Error('Unable to read token from DuckDuckGo response.');
		}

		return vqd;
	}

	public async imageSearch(
		query: string,
		token: string,
		options?: DdgSearchOptions,
	): Promise<string> {
		const searchOptions: DdgSearchOptions = options ?? {};
		const url: string = this.createSearchUrl(query, token, searchOptions);

		const request = new AsyncResolvingHttpRequest(url, HttpMethod.GET, this.SEARCH_HEADERS);
		const response: http.IncomingMessage = await request.resolve();
		const reader = new HttpResponseReader();

		return reader.readData(response);
	}

	private createSearchUrl(query: string, token: string, options: DdgSearchOptions): string {
		const params = new URLSearchParams();
		params.append('l', 'de-de');
		params.append('o', 'json');
		params.append('q', query);
		params.append('vqd', token);
		params.append('f', this.createImageSearchOptionsHeader(options));
		params.append('p', options.safeSearch == true ? '1' : '-1');

		return `https://duckduckgo.com/i.js?${params.toString()}`;
	}

	private createImageSearchOptionsHeader(options: DdgSearchOptions): string {
		const optionValues: string[] = [];

		for (const optionName of this.OPTION_NAMES) {
			const optionValue: string | undefined = options[optionName as keyof DdgSearchOptions]?.toString();

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
