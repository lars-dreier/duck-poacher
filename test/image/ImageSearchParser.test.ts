import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import ImageSearchParser from '../../src/image/ImageSearchParser.ts';

describe('ImageSearchParser', () => {
	describe('parse', () => {
		it('maps DDG image/thumbnail pairs to ImageSearchResult fields', () => {
			// Given a raw DDG response with two results
			const parser = new ImageSearchParser();
			const responseText: string = JSON.stringify({
				results: [
					{ image: 'https://example.com/a.jpg', thumbnail: 'https://example.com/a-thumb.jpg' },
					{ image: 'https://example.com/b.jpg', thumbnail: 'https://example.com/b-thumb.jpg' }
				]
			});

			// When the response is parsed
			const results = parser.parse(responseText);

			// Then each result keeps DDG's image→imageUrl and thumbnail→thumbnailUrl mapping
			assert.equal(results.length, 2);
			assert.equal(results[0]?.imageUrl, 'https://example.com/a.jpg');
			assert.equal(results[0]?.thumbnailUrl, 'https://example.com/a-thumb.jpg');
			assert.equal(results[1]?.imageUrl, 'https://example.com/b.jpg');
			assert.equal(results[1]?.thumbnailUrl, 'https://example.com/b-thumb.jpg');
		});

		it('returns an empty list for a response with no results', () => {
			// Given a raw DDG response with an empty results array
			const parser = new ImageSearchParser();
			const responseText: string = JSON.stringify({ results: [] });

			// When the response is parsed
			const results = parser.parse(responseText);

			// Then the parsed list is empty
			assert.equal(results.length, 0);
		});
	});
});
