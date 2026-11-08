import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import BotChallengeError from '../../src/common/BotChallengeError.ts';
import ImageSearchParser from '../../src/image/ImageSearchParser.ts';
import type ImageSearchResult from '../../src/image/ImageSearchResult.ts';

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
			const results: ImageSearchResult[] = parser.parse(responseText);

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
			const results: ImageSearchResult[] = parser.parse(responseText);

			// Then the parsed list is empty
			assert.equal(results.length, 0);
		});

		it("throws BotChallengeError with DDG's reason when DDG answers with a challenge", () => {
			// Given a raw DDG response carrying a bot challenge and no results
			const parser = new ImageSearchParser();
			const responseText: string = JSON.stringify({
				response_type: 'botnet_challenge',
				challenge: { cc: 'botnet', s: 'images' }
			});

			// When the response is parsed
			// Then it fails with a BotChallengeError carrying DDG's category
			assert.throws(() => parser.parse(responseText), (error: unknown) => {
				assert.ok(error instanceof BotChallengeError);
				assert.equal(error.reason, 'botnet');

				return true;
			});
		});

		it('reports an unknown reason when the challenge carries no category', () => {
			// Given a raw DDG challenge without a cc field
			const parser = new ImageSearchParser();
			const responseText: string = JSON.stringify({ challenge: {} });

			// When the response is parsed
			// Then the reason falls back to unknown
			assert.throws(() => parser.parse(responseText), { name: 'BotChallengeError', reason: 'unknown' });
		});
	});
});
