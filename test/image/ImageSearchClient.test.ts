import { HttpError } from 'node-http-toolkit';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import BotChallengeError from '../../src/common/BotChallengeError.ts';
import DdgHttpClient from '../../src/common/DdgHttpClient.ts';
import ImageSearchClient from '../../src/image/ImageSearchClient.ts';
import ImageSearchParser from '../../src/image/ImageSearchParser.ts';

/**
 * Stands in for the network: every request fails with the given error.
 */
class FailingHttpClient extends DdgHttpClient {
	public constructor(private readonly _error: Error) {
		super();
	}

	public override get(): Promise<string> {
		return Promise.reject(this._error);
	}
}

describe('ImageSearchClient', () => {
	describe('imageSearch', () => {
		it('reports a 403 from i.js as a bot challenge', async () => {
			// Given a client whose i.js request is rejected with HTTP 403
			const forbidden = new HttpError(403, 'Forbidden');
			const client = new ImageSearchClient(new ImageSearchParser(), new FailingHttpClient(forbidden));

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
			const client = new ImageSearchClient(new ImageSearchParser(), new FailingHttpClient(serverError));

			// When an image search is performed
			// Then the original HttpError is rethrown
			await assert.rejects(client.imageSearch('test', '4-123'), (error: unknown) => {
				assert.equal(error, serverError);

				return true;
			});
		});
	});
});
