import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import DuckDuckGo from '../src/DuckDuckGo.ts';
import type ImageSearchResult from '../src/image/ImageSearchResult.ts';
import type ImageSearchSession from '../src/image/ImageSearchSession.ts';
import type WebSearchResult from '../src/web/WebSearchResult.ts';
import { assertHttpUrl, NETWORK_TIMEOUT_MS, TEST_QUERY } from './TestHelper.ts';

describe('DuckDuckGo', () => {
	describe('imageSearch', () => {
		it('returns parsed image results without a caller-supplied token', { timeout: NETWORK_TIMEOUT_MS }, async () => {
			// Given the public facade (which manages the token internally)
			const client = new DuckDuckGo();

			// When an image search is performed with no token argument
			const results: ImageSearchResult[] = await client.imageSearch(TEST_QUERY);

			// Then it returns a non-empty list, each with valid thumbnail and image URLs
			assert.ok(results.length > 0, 'results should not be empty');
			for (const result of results) {
				assertHttpUrl(result.imageUrl, 'imageUrl');
				assertHttpUrl(result.thumbnailUrl, 'thumbnailUrl');
			}
		});
	});

	describe('createImageSearchSession', () => {
		it('runs searches with different options on one token', { timeout: NETWORK_TIMEOUT_MS }, async () => {
			// Given a session for the query
			const client = new DuckDuckGo();
			const session: ImageSearchSession = await client.createImageSearchSession(TEST_QUERY);

			// When a filtered search and one with safe search off are run on it
			const filtered: ImageSearchResult[] = await session.search({ size: 'Large' });
			const safeSearchOff: ImageSearchResult[] = await session.search({ safeSearch: 'Off' });

			// Then DDG accepts the reused token for both and returns non-empty lists
			assert.ok(filtered.length > 0, 'filtered results should not be empty');
			assert.ok(safeSearchOff.length > 0, 'safe search off results should not be empty');
		});
	});

	describe('webSearch', () => {
		it('returns parsed web results without a caller-supplied token', { timeout: NETWORK_TIMEOUT_MS }, async () => {
			// Given the public facade (which manages the search URL internally)
			const client = new DuckDuckGo();

			// When a web search is performed with no token argument
			const results: WebSearchResult[] = await client.webSearch(TEST_QUERY);

			// Then it returns a non-empty list, each with a title and a valid URL
			assert.ok(results.length > 0, 'results should not be empty');
			for (const result of results) {
				assert.ok(result.title.length > 0, 'title should not be empty');
				assertHttpUrl(result.url, 'url');
			}
		});

		it('returns parsed web results with a safe search option', { timeout: NETWORK_TIMEOUT_MS }, async () => {
			// Given the public facade
			const client = new DuckDuckGo();

			// When a web search is performed with strict safe search
			const results: WebSearchResult[] = await client.webSearch(TEST_QUERY, { safeSearch: 'Strict' });

			// Then it returns a non-empty list, each with a title and a valid URL
			assert.ok(results.length > 0, 'results should not be empty');
			for (const result of results) {
				assert.ok(result.title.length > 0, 'title should not be empty');
				assertHttpUrl(result.url, 'url');
			}
		});
	});
});
