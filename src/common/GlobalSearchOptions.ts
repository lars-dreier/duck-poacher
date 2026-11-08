import type * as http from 'node:http';
import type { DdgSafeSearch, DdgSearchOptions } from './DdgSearchOptions.ts';
import { SafeSearchParam } from './SafeSearchParam.ts';

/**
 * Applies the options every DuckDuckGo search shares to a request's headers. Safe search travels as DDG's `p`
 * cookie; `Moderate`, DDG's default, sends no cookie.
 */
export default class GlobalSearchOptions {
	public constructor(private readonly _options: DdgSearchOptions = {}) {}

	// Returns a copy: callers pass their shared header constants, which must not pick up a cookie.
	public apply(headers: http.OutgoingHttpHeaders): http.OutgoingHttpHeaders {
		const cookie: string | undefined = this.createSafeSearchCookie(this._options.safeSearch ?? 'Moderate');

		return cookie == null ? { ...headers } : { ...headers, cookie };
	}

	private createSafeSearchCookie(safeSearch: DdgSafeSearch): string | undefined {
		switch (safeSearch) {
			case 'Off':
				return `p=${SafeSearchParam.Off}`;
			case 'Moderate':
				return undefined;
			case 'Strict':
				return `p=${SafeSearchParam.Strict}`;
		}
	}
}
