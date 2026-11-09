// DDG's `p` cookie value per safe search level. `Moderate` is DDG's default and sends no cookie.
const SafeSearchCookie = {
	Off: '-2',
	Strict: '1'
} as const;
type SafeSearchCookie = typeof SafeSearchCookie[keyof typeof SafeSearchCookie];
export { SafeSearchCookie };
