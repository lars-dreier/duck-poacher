import { AsyncResolvingHttpRequest, HttpMethod, HttpResponseReader } from 'node-http-toolkit';
import type * as http from 'node:http';
import type { DdgSearchOptions } from './DdgSearchOptions.ts';
import GlobalSearchOptions from './GlobalSearchOptions.ts';

/**
 * Performs DuckDuckGo GET requests with the options every search shares applied to the headers.
 */
export default class DdgHttpClient {
	public async get(
		url: string,
		headers: http.OutgoingHttpHeaders,
		options?: DdgSearchOptions,
	): Promise<string> {
		const request = new AsyncResolvingHttpRequest(
			url,
			HttpMethod.GET,
			new GlobalSearchOptions(options).apply(headers)
		);
		const response: http.IncomingMessage = await request.resolve();
		const reader = new HttpResponseReader();

		return reader.readData(response);
	}
}
