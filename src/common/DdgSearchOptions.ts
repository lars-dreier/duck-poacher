/** Safe search level. `Moderate` is DuckDuckGo's own default. */
export type DdgSafeSearch = 'Off' | 'Moderate' | 'Strict';

/** Options shared by every DuckDuckGo search. All fields are optional. */
export type DdgSearchOptions = {
	/** Safe search level; defaults to `Moderate` when omitted. */
	safeSearch?: DdgSafeSearch;
};
