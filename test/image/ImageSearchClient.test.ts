import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import DdgHttpClient from '../../src/common/DdgHttpClient.ts';
import ImageSearchClient from '../../src/image/ImageSearchClient.ts';
import ImageSearchParser from '../../src/image/ImageSearchParser.ts';
import type ImageSearchResult from '../../src/image/ImageSearchResult.ts';
import { assertHttpUrl, NETWORK_TIMEOUT_MS, TEST_QUERY } from '../TestHelper.ts';

describe('ImageSearchClient', () => {
	describe('generateToken', () => {
		it('scrapes a vqd token from the live DuckDuckGo response', { timeout: NETWORK_TIMEOUT_MS }, async () => {
			// Given the live image search client
			const client = new ImageSearchClient(new ImageSearchParser(), new DdgHttpClient());

			// When a token is generated for a query
			const token: string = await client.generateToken(TEST_QUERY);

			// Then it is a non-empty vqd token made of digits and dashes
			assert.ok(token.length > 0, 'token should not be empty');
			assert.match(token, /^[\d-]+$/);
		});
	});

	describe('imageSearch', () => {
		it('returns parsed image results with valid URLs', { timeout: NETWORK_TIMEOUT_MS }, async () => {
			// Given a valid token for the query
			const client = new ImageSearchClient(new ImageSearchParser(), new DdgHttpClient());
			const token: string = await client.generateToken(TEST_QUERY);

			// When an image search is performed
			const results: ImageSearchResult[] = await client.imageSearch(TEST_QUERY, token);

			// Then it returns a non-empty list, each with valid thumbnail and image URLs
			assert.ok(results.length > 0, 'results should not be empty');
			for (const result of results) {
				assertHttpUrl(result.imageUrl, 'imageUrl');
				assertHttpUrl(result.thumbnailUrl, 'thumbnailUrl');
			}
		});

		it('applies search options without error', { timeout: NETWORK_TIMEOUT_MS }, async () => {
			// Given a valid token and a set of search options
			const client = new ImageSearchClient(new ImageSearchParser(), new DdgHttpClient());
			const token: string = await client.generateToken(TEST_QUERY);

			// When searching with size, layout and safe-search constraints
			const results: ImageSearchResult[] = await client.imageSearch(TEST_QUERY, token, {
				size: 'Large',
				layout: 'Square',
				safeSearch: 'Strict'
			});

			// Then a parsed result list is still returned
			assert.ok(Array.isArray(results));
		});

		for (const safeSearch of ['Off', 'Moderate', 'Strict'] as const) {
			it(`returns parsed results with safe search ${safeSearch}`, { timeout: NETWORK_TIMEOUT_MS }, async () => {
				// Given a token minted with the safe search level
				const client = new ImageSearchClient(new ImageSearchParser(), new DdgHttpClient());
				const token: string = await client.generateToken(TEST_QUERY, { safeSearch });

				// When searching with the same level
				const results: ImageSearchResult[] = await client.imageSearch(TEST_QUERY, token, { safeSearch });

				// Then DDG accepts the level and returns a non-empty list
				assert.ok(results.length > 0, 'results should not be empty');
			});
		}
	});
});
