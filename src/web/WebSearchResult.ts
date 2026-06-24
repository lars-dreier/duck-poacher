/** A single web search hit. Immutable. */
export default class WebSearchResult {
	public constructor(
		/** Title of the result page. */
		public readonly title: string,
		/** URL of the result page. */
		public readonly url: string,
		/** Snippet describing the result. */
		public readonly description: string,
	) {}
}
