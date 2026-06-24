/** A single image search hit. Immutable. */
export default class ImageSearchResult {
	public constructor(
		/** URL of the thumbnail-sized image. */
		public readonly thumbnailUrl: string,
		/** URL of the full-sized image. */
		public readonly imageUrl: string,
	) {}
}
