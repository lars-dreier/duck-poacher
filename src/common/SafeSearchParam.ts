// DDG's value for each safe search level, shared by the `p` cookie and i.js's `p` URL parameter.
const SafeSearchParam = {
	Off: '-2',
	Moderate: '-1',
	Strict: '1'
} as const;
type SafeSearchParam = typeof SafeSearchParam[keyof typeof SafeSearchParam];
export { SafeSearchParam };
