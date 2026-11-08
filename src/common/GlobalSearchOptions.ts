import type * as http from 'http';

/** Safe search level. `Moderate` is DuckDuckGo's own default. */
export type DdgSafeSearch = 'Off' | 'Moderate' | 'Strict';

/** Options shared by every DuckDuckGo search. All fields are optional. */
export interface DdgSearchOptions {
	/** Safe search level; defaults to `Moderate` when omitted. */
	safeSearch?: DdgSafeSearch;
}

// DDG's value for each safe search level, shared by the `p` cookie and i.js's `p` URL parameter.
export const SafeSearchParam = {
	Off: '-2',
	Moderate: '-1',
	Strict: '1'
} as const satisfies Record<DdgSafeSearch, string>;
export type SafeSearchParam = typeof SafeSearchParam[keyof typeof SafeSearchParam];

export default class GlobalSearchOptions {
	public constructor(private readonly _options: DdgSearchOptions = {}) {}

	// Returns a copy: callers pass their shared header constants, which must not pick up a cookie.
	public apply(headers: http.OutgoingHttpHeaders): http.OutgoingHttpHeaders {
		const cookie: string | undefined = this.createSafeSearchCookie(this._options.safeSearch ?? 'Moderate');

		return cookie == null ? { ...headers } : { ...headers, cookie };
	}

	// Moderate is DDG's default, which it expresses as the absence of the cookie.
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
