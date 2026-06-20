import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import DuckDuckGo from '../src/DuckDuckGo.ts';
import { assertHttpUrl, NETWORK_TIMEOUT_MS, TEST_QUERY } from './TestHelper.ts';

describe('DuckDuckGo', () => {
	describe('imageSearch', () => {
		it('returns parsed image results without a caller-supplied token', { timeout: NETWORK_TIMEOUT_MS }, async () => {
			// Given the public facade (which manages the token internally)
			const client = new DuckDuckGo();

			// When an image search is performed with no token argument
			const results = await client.imageSearch(TEST_QUERY);

			// Then it returns a non-empty list, each with valid thumbnail and image URLs
			assert.ok(results.length > 0, 'results should not be empty');
			for (const result of results) {
				assertHttpUrl(result.imageUrl, 'imageUrl');
				assertHttpUrl(result.thumbnailUrl, 'thumbnailUrl');
			}
		});
	});
});
