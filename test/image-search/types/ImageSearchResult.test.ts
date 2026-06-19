import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import ImageSearchResult from '../../../src/image-search/types/ImageSearchResult.ts';

describe('ImageSearchResult', () => {
	describe('constructor', () => {
		it('exposes the thumbnail and image URLs it was constructed with', () => {
			// Given a thumbnail URL and a full-image URL
			const thumbnailUrl: string = 'https://example.com/thumb.jpg';
			const imageUrl: string = 'https://example.com/full.jpg';

			// When a result is constructed from them
			const result = new ImageSearchResult(thumbnailUrl, imageUrl);

			// Then both URLs are exposed unchanged
			assert.equal(result.thumbnailUrl, thumbnailUrl);
			assert.equal(result.imageUrl, imageUrl);
		});
	});
});
