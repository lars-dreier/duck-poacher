import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import DuckDuckGoImageSearch from '../../src/image/DuckDuckGoImageSearch.ts';
import { assertHttpUrl, NETWORK_TIMEOUT_MS, TEST_QUERY } from '../TestHelper.ts';

// The engine runs the prioritized query strategy (one token + several searches)
// sequentially, so it needs a larger budget than a single request.
const ENGINE_TIMEOUT_MS: number = NETWORK_TIMEOUT_MS * 4;

describe('DuckDuckGoImageSearch', () => {
	describe('search', () => {
		it('returns image results with valid URLs for a query', { timeout: ENGINE_TIMEOUT_MS }, async () => {
			// Given the live engine
			const engine = new DuckDuckGoImageSearch();

			// When searching for a query
			const results = await engine.search(TEST_QUERY);

			// Then it returns a non-empty list, each with valid thumbnail and image URLs
			assert.ok(results.length > 0, 'expected at least one result');
			for (const result of results) {
				assertHttpUrl(result.imageUrl, 'imageUrl');
				assertHttpUrl(result.thumbnailUrl, 'thumbnailUrl');
			}
		});

		it('caps at 100 results and dedupes by image URL', { timeout: ENGINE_TIMEOUT_MS }, async () => {
			// Given the live engine
			const engine = new DuckDuckGoImageSearch();

			// When searching for a query
			const results = await engine.search(TEST_QUERY);

			// Then no more than 100 results are returned and every image URL is unique
			assert.ok(results.length <= 100, 'should cap at 100 results');
			const imageUrls: string[] = results.map((result) => result.imageUrl);
			assert.equal(new Set(imageUrls).size, imageUrls.length, 'image URLs should be unique');
		});
	});
});
