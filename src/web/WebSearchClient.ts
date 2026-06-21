import * as http from 'http';
import { AsyncResolvingHttpRequest, HttpMethod, HttpResponseReader } from 'node-http-toolkit';

export default class WebSearchClient {
	private readonly TOKEN_HEADERS: http.OutgoingHttpHeaders = {
		dnt: '1'
	};

	private readonly TOKEN_REGEX = /vqd=(?<vqd>[\d-]+)/;

	public async generateToken(query: string): Promise<string> {
		const params = new URLSearchParams();
		params.append('q', query);
		params.append('ia', 'web');
		params.append('t', 'h_');

		const url: string = `https://duckduckgo.com/?${params.toString()}`;
		const data: string = await this.get(url, this.TOKEN_HEADERS);
		const match: RegExpMatchArray | null = data.match(this.TOKEN_REGEX);
		const vqd: string | undefined = match?.groups?.['vqd'];

		if (vqd == null) {
			throw new Error('Unable to read token from DuckDuckGo response.');
		}

		return vqd;
	}

	private async get(url: string, headers: http.OutgoingHttpHeaders): Promise<string> {
		const request = new AsyncResolvingHttpRequest(url, HttpMethod.GET, headers);
		const response: http.IncomingMessage = await request.resolve();
		const reader = new HttpResponseReader();

		return reader.readData(response);
	}
}
