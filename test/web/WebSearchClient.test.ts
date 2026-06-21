import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import WebSearchClient from '../../src/web/WebSearchClient.ts';
import { NETWORK_TIMEOUT_MS, TEST_QUERY } from '../TestHelper.ts';

describe('WebSearchClient', () => {
	describe('generateToken', () => {
		it('scrapes a vqd token from the live DuckDuckGo response', { timeout: NETWORK_TIMEOUT_MS }, async () => {
			// Given the live web search client
			const client = new WebSearchClient();

			// When a token is generated for a query
			const token: string = await client.generateToken(TEST_QUERY);

			// Then it is a non-empty vqd token made of digits and dashes
			assert.ok(token.length > 0, 'token should not be empty');
			assert.match(token, /^[\d-]+$/);
		});
	});
});
