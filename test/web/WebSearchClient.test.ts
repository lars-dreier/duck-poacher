import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import WebSearchClient from '../../src/web/WebSearchClient.ts';
import { assertHttpUrl, NETWORK_TIMEOUT_MS, TEST_QUERY } from '../TestHelper.ts';

describe('WebSearchClient', () => {
	describe('generateToken', () => {
		it('scrapes the signed d.js search URL from the live DuckDuckGo response', {
			timeout: NETWORK_TIMEOUT_MS
		}, async () => {
			// Given the live web search client
			const client = new WebSearchClient();

			// When a token is generated for a query
			const token: string = await client.generateToken(TEST_QUERY);

			// Then it is the absolute links.duckduckgo.com/d.js URL carrying the signed dp blob
			assert.match(token, /^https:\/\/links\.duckduckgo\.com\/d\.js\?/);
			assert.match(token, /[&?]dp=/);
		});
	});

	describe('webSearch', () => {
		it('returns parsed web results with valid URLs', { timeout: NETWORK_TIMEOUT_MS }, async () => {
			// Given a valid token for the query
			const client = new WebSearchClient();
			const token: string = await client.generateToken(TEST_QUERY);

			// When a web search is performed
			const results = await client.webSearch(TEST_QUERY, token);

			// Then it returns a non-empty list, each with a title and a valid URL
			assert.ok(results.length > 0, 'results should not be empty');
			for (const result of results) {
				assert.ok(result.title.length > 0, 'title should not be empty');
				assertHttpUrl(result.url, 'url');
			}
		});
	});
});
