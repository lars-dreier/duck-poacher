import { HttpError } from 'node-http-toolkit';
import assert from 'node:assert/strict';
import type * as http from 'node:http';
import { describe, it } from 'node:test';
import BotChallengeError from '../../src/common/BotChallengeError.ts';
import DdgHttpClient from '../../src/common/DdgHttpClient.ts';
import ImageSearchClient from '../../src/image/ImageSearchClient.ts';
import ImageSearchParser from '../../src/image/ImageSearchParser.ts';

/**
 * Stands in for the network: records the headers of every request, then fails with the given error or, without one,
 * answers with a token page or an empty result list.
 */
class StubHttpClient extends DdgHttpClient {
	public readonly headers: http.OutgoingHttpHeaders[] = [];

	public constructor(private readonly _error?: Error) {
		super();
	}

	public override get(url: string, headers: http.OutgoingHttpHeaders): Promise<string> {
		this.headers.push(headers);

		if (this._error != null) {
			return Promise.reject(this._error);
		}

		return Promise.resolve(url.includes('/i.js') ? JSON.stringify({ results: [] }) : 'vqd=4-123&');
	}
}

describe('ImageSearchClient', () => {
	describe('generateToken', () => {
		it("sends Firefox's page load headers in Firefox's order", async () => {
			// Given a client whose requests are recorded
			const httpClient = new StubHttpClient();
			const client = new ImageSearchClient(new ImageSearchParser(), httpClient);

			// When a token is generated
			await client.generateToken('test');

			// Then host comes first and connection follows sec-gpc, as in a captured Firefox request
			assert.deepEqual(Object.keys(httpClient.headers[0] ?? {}), [
				'host',
				'user-agent',
				'accept',
				'accept-language',
				'accept-encoding',
				'dnt',
				'sec-gpc',
				'connection',
				'upgrade-insecure-requests',
				'sec-fetch-dest',
				'sec-fetch-mode',
				'sec-fetch-site',
				'sec-fetch-user'
			]);
		});
	});

	describe('imageSearch', () => {
		it("sends Firefox's i.js headers in Firefox's order", async () => {
			// Given a client whose requests are recorded
			const httpClient = new StubHttpClient();
			const client = new ImageSearchClient(new ImageSearchParser(), httpClient);

			// When an image search is performed
			await client.imageSearch('test', '4-123');

			// Then host comes first, referer precedes dnt and connection follows sec-gpc, as in a captured Firefox request
			assert.deepEqual(Object.keys(httpClient.headers[0] ?? {}), [
				'host',
				'user-agent',
				'accept',
				'accept-language',
				'accept-encoding',
				'referer',
				'dnt',
				'sec-gpc',
				'connection',
				'sec-fetch-dest',
				'sec-fetch-mode',
				'sec-fetch-site'
			]);
		});

		it('reports a 403 from i.js as a bot challenge', async () => {
			// Given a client whose i.js request is rejected with HTTP 403
			const forbidden = new HttpError(403, 'Forbidden');
			const client = new ImageSearchClient(new ImageSearchParser(), new StubHttpClient(forbidden));

			// When an image search is performed
			// Then it fails with a BotChallengeError that keeps the 403 as its cause
			await assert.rejects(client.imageSearch('test', '4-123'), (error: unknown) => {
				assert.ok(error instanceof BotChallengeError);
				assert.equal(error.reason, 'forbidden');
				assert.equal(error.cause, forbidden);

				return true;
			});
		});

		it('passes other HTTP errors through unchanged', async () => {
			// Given a client whose i.js request fails with HTTP 500
			const serverError = new HttpError(500, 'Internal Server Error');
			const client = new ImageSearchClient(new ImageSearchParser(), new StubHttpClient(serverError));

			// When an image search is performed
			// Then the original HttpError is rethrown
			await assert.rejects(client.imageSearch('test', '4-123'), (error: unknown) => {
				assert.equal(error, serverError);

				return true;
			});
		});
	});
});
