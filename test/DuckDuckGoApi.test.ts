import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import DuckDuckGoApi from '../src/DuckDuckGoApi.ts';
import { assertHttpUrl, NETWORK_TIMEOUT_MS, TEST_QUERY } from './TestHelper.ts';

describe('DuckDuckGoApi', () => {
	describe('generateToken', () => {
		it('scrapes a vqd token from the live DuckDuckGo response', { timeout: NETWORK_TIMEOUT_MS }, async () => {
			// Given the live DDG API
			const api = new DuckDuckGoApi();

			// When a token is generated for a query
			const token: string = await api.generateToken(TEST_QUERY);

			// Then it is a non-empty vqd token made of digits and dashes
			assert.ok(token.length > 0, 'token should not be empty');
			assert.match(token, /^[\d-]+$/);
		});
	});

	describe('imageSearch', () => {
		it('returns parsed image results with valid URLs', { timeout: NETWORK_TIMEOUT_MS }, async () => {
			// Given a valid token for the query
			const api = new DuckDuckGoApi();
			const token: string = await api.generateToken(TEST_QUERY);

			// When an image search is performed
			const results = await api.imageSearch(TEST_QUERY, token);

			// Then it returns a non-empty list, each with valid thumbnail and image URLs
			assert.ok(results.length > 0, 'results should not be empty');
			for (const result of results) {
				assertHttpUrl(result.imageUrl, 'imageUrl');
				assertHttpUrl(result.thumbnailUrl, 'thumbnailUrl');
			}
		});

		it('applies search options without error', { timeout: NETWORK_TIMEOUT_MS }, async () => {
			// Given a valid token and a set of search options
			const api = new DuckDuckGoApi();
			const token: string = await api.generateToken(TEST_QUERY);

			// When searching with size, layout and safe-search constraints
			const results = await api.imageSearch(TEST_QUERY, token, {
				size: 'Large',
				layout: 'Square',
				safeSearch: true
			});

			// Then a parsed result list is still returned
			assert.ok(Array.isArray(results));
		});
	});
});
