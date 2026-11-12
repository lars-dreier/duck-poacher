import assert from 'node:assert/strict';
import type * as http from 'node:http';
import { describe, it } from 'node:test';
import DdgHttpClient from '../../src/common/DdgHttpClient.ts';
import type { DdgSearchOptions } from '../../src/common/DdgSearchOptions.ts';
import ImageSearchClient from '../../src/image/ImageSearchClient.ts';
import ImageSearchParser from '../../src/image/ImageSearchParser.ts';
import ImageSearchSession from '../../src/image/ImageSearchSession.ts';

/**
 * Stands in for the network: records every request and answers with an empty result list.
 */
class RecordingHttpClient extends DdgHttpClient {
	public readonly urls: URL[] = [];
	public readonly options: (DdgSearchOptions | undefined)[] = [];

	public override get(
		url: string,
		_headers: http.OutgoingHttpHeaders,
		options?: DdgSearchOptions,
	): Promise<string> {
		this.urls.push(new URL(url));
		this.options.push(options);

		return Promise.resolve(JSON.stringify({ results: [] }));
	}
}

describe('ImageSearchSession', () => {
	describe('search', () => {
		it('reuses the session token for searches with different filters', async () => {
			// Given a session for a query and token
			const httpClient = new RecordingHttpClient();
			const client = new ImageSearchClient(new ImageSearchParser(), httpClient);
			const session = new ImageSearchSession(client, 'test', '4-123');

			// When two searches with different filters are run
			await session.search({ size: 'Large', layout: 'Square' });
			await session.search();

			// Then both i.js requests carry the session's query and token, each with its own filters
			assert.equal(httpClient.urls.length, 2);
			for (const url of httpClient.urls) {
				assert.equal(url.pathname, '/i.js');
				assert.equal(url.searchParams.get('q'), 'test');
				assert.equal(url.searchParams.get('vqd'), '4-123');
			}
			assert.equal(httpClient.urls[0]?.searchParams.get('f'), ',size:Large,,,layout:Square,');
			assert.equal(httpClient.urls[1]?.searchParams.get('f'), ',,,,,');
		});

		it('applies each search its own safe search level on the shared token', async () => {
			// Given a session for a query and token
			const httpClient = new RecordingHttpClient();
			const client = new ImageSearchClient(new ImageSearchParser(), httpClient);
			const session = new ImageSearchSession(client, 'test', '4-123');

			// When a search with safe search off follows one with DDG's default level
			await session.search();
			await session.search({ safeSearch: 'Off' });

			// Then both use the token, each with its own level as URL parameter and as options for the cookie
			assert.equal(httpClient.urls[0]?.searchParams.get('vqd'), '4-123');
			assert.equal(httpClient.urls[1]?.searchParams.get('vqd'), '4-123');
			assert.equal(httpClient.urls[0]?.searchParams.get('p'), '1');
			assert.equal(httpClient.urls[1]?.searchParams.get('p'), '-1');
			assert.equal(httpClient.options[0]?.safeSearch, undefined);
			assert.equal(httpClient.options[1]?.safeSearch, 'Off');
		});
	});
});
