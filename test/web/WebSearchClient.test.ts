import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import WebSearchClient from '../../src/web/WebSearchClient.ts';
import WebSearchParser from '../../src/web/WebSearchParser.ts';
import type WebSearchResult from '../../src/web/WebSearchResult.ts';
import { assertHttpUrl, NETWORK_TIMEOUT_MS, TEST_QUERY } from '../TestHelper.ts';

describe('WebSearchClient', () => {
	describe('generateToken', () => {
		it('scrapes the signed d.js search URL from the live DuckDuckGo response', {
			timeout: NETWORK_TIMEOUT_MS
		}, async () => {
			// Given the live web search client
			const client = new WebSearchClient(new WebSearchParser());

			// When a token is generated for a query
			const token: string = await client.generateToken(TEST_QUERY);

			// Then it is the absolute links.duckduckgo.com/d.js URL carrying the signed dp blob
			assert.match(token, /^https:\/\/links\.duckduckgo\.com\/d\.js\?/);
			assert.match(token, /[&?]dp=/);
		});

		it('mints a moderate safe search URL when safe search is omitted', { timeout: NETWORK_TIMEOUT_MS }, async () => {
			// Given the live web search client
			const client = new WebSearchClient(new WebSearchParser());

			// When a token is generated without a safe search option
			const token: string = await client.generateToken(TEST_QUERY);

			// Then DDG's moderate default is baked into the signed URL
			assert.match(token, /[&?]ex=-1(&|$)/);
		});

		it('mints a safe-search-off URL when safe search is Off', { timeout: NETWORK_TIMEOUT_MS }, async () => {
			// Given the live web search client
			const client = new WebSearchClient(new WebSearchParser());

			// When a token is generated with safe search turned off
			const token: string = await client.generateToken(TEST_QUERY, { safeSearch: 'Off' });

			// Then the signed URL carries DDG's "off" marker
			assert.match(token, /[&?]ex=-2(&|$)/);
		});

		it('mints a strict safe search URL when safe search is Strict', { timeout: NETWORK_TIMEOUT_MS }, async () => {
			// Given the live web search client
			const client = new WebSearchClient(new WebSearchParser());

			// When a token is generated with strict safe search
			const token: string = await client.generateToken(TEST_QUERY, { safeSearch: 'Strict' });

			// Then the signed URL carries DDG's "strict" marker
			assert.match(token, /[&?]p=1(&|$)/);
		});
	});

	describe('webSearch', () => {
		it('returns parsed web results with valid URLs', { timeout: NETWORK_TIMEOUT_MS }, async () => {
			// Given a valid token for the query
			const client = new WebSearchClient(new WebSearchParser());
			const token: string = await client.generateToken(TEST_QUERY);

			// When a web search is performed
			const results: WebSearchResult[] = await client.webSearch(TEST_QUERY, token);

			// Then it returns a non-empty list, each with a title and a valid URL
			assert.ok(results.length > 0, 'results should not be empty');
			for (const result of results) {
				assert.ok(result.title.length > 0, 'title should not be empty');
				assertHttpUrl(result.url, 'url');
			}
		});
	});
});
