import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import DuckDuckGoAPI from '../../../src/image-search/api/DuckDuckGoAPI.ts';
import { NETWORK_TIMEOUT_MS, TEST_QUERY } from '../../TestHelper.ts';

interface RawDdgResponse {
	results: Array<{ image: string; thumbnail: string }>;
}

describe('DuckDuckGoAPI', () => {
	describe('generateToken', () => {
		it('scrapes a vqd token from the live DuckDuckGo response', { timeout: NETWORK_TIMEOUT_MS }, async () => {
			// Given the live DDG API
			const api = new DuckDuckGoAPI();

			// When a token is generated for a query
			const token: string = await api.generateToken(TEST_QUERY);

			// Then it is a non-empty vqd token made of digits and dashes
			assert.ok(token.length > 0, 'token should not be empty');
			assert.match(token, /^[\d-]+$/);
		});
	});

	describe('imageSearch', () => {
		it('returns parseable JSON with image results', { timeout: NETWORK_TIMEOUT_MS }, async () => {
			// Given a valid token for the query
			const api = new DuckDuckGoAPI();
			const token: string = await api.generateToken(TEST_QUERY);

			// When an image search is performed
			const responseText: string = await api.imageSearch(TEST_QUERY, token);

			// Then the response parses to a non-empty results array of image/thumbnail pairs
			const parsed = JSON.parse(responseText) as RawDdgResponse;
			assert.ok(Array.isArray(parsed.results), 'results should be an array');
			assert.ok(parsed.results.length > 0, 'results should not be empty');

			const first = parsed.results[0];
			assert.ok(first !== undefined);
			assert.equal(typeof first.image, 'string');
			assert.equal(typeof first.thumbnail, 'string');
		});

		it('applies search options without error', { timeout: NETWORK_TIMEOUT_MS }, async () => {
			// Given a valid token and a set of search options
			const api = new DuckDuckGoAPI();
			const token: string = await api.generateToken(TEST_QUERY);

			// When searching with size, layout and safe-search constraints
			const responseText: string = await api.imageSearch(TEST_QUERY, token, {
				size: 'Large',
				layout: 'Square',
				safeSearch: true
			});

			// Then a parseable response is still returned
			const parsed = JSON.parse(responseText) as RawDdgResponse;
			assert.ok(Array.isArray(parsed.results));
		});
	});
});
