import type ImageSearchResult from './ImageSearchResult.ts';

export default interface IImageSearchEngine {
	search(query: string): Promise<ImageSearchResult[]>;
}
