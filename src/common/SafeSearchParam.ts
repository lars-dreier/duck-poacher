// DDG's value for i.js's `p` URL parameter per safe search level. Not the cookie value: `Off` is `-1` here, `-2` there.
const SafeSearchParam = {
	Off: '-1',
	Moderate: '1',
	Strict: '1'
} as const;
type SafeSearchParam = typeof SafeSearchParam[keyof typeof SafeSearchParam];
export { SafeSearchParam };
