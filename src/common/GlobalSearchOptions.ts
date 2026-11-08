import type * as http from 'node:http';
import type { DdgSafeSearch, DdgSearchOptions } from './DdgSearchOptions.ts';
import { SafeSearchParam } from './SafeSearchParam.ts';

/**
 * Translates the options every DuckDuckGo search shares into request headers and URL values.
 */
export default class GlobalSearchOptions {
	public constructor(private readonly _options: DdgSearchOptions = {}) {}

	public get safeSearchParam(): SafeSearchParam {
		return SafeSearchParam[this._safeSearch];
	}

	private get _safeSearch(): DdgSafeSearch {
		return this._options.safeSearch ?? 'Moderate';
	}

	// Returns a copy: callers pass their shared header constants, which must not pick up a cookie.
	public apply(headers: http.OutgoingHttpHeaders): http.OutgoingHttpHeaders {
		const cookie: string | undefined = this.createSafeSearchCookie(this._safeSearch);

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
