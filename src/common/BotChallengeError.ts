/**
 * Thrown when DuckDuckGo answers a search with a bot challenge instead of results. Usually temporary: a search on
 * the real website clears it. `name` is fixed so callers can identify the error where `instanceof` fails, which
 * happens when an app loads both the ESM and CJS builds.
 */
export default class BotChallengeError extends Error {
	public override readonly name: string = 'BotChallengeError';

	public constructor(
		/** DDG's undocumented category for the challenge, e.g. `botnet`; `unknown` if it sent none. */
		public readonly reason: string,
	) {
		super(`DuckDuckGo answered with a bot challenge (${reason}) instead of results.`);
	}
}
