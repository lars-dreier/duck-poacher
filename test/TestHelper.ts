import assert from 'node:assert/strict';

/**
 * Shared fixtures for the live DuckDuckGo test suite. Every spec here hits the
 * real DDG endpoints, so a stable, image-rich query keeps the assertions robust
 * against DDG's ever-changing result set.
 */
export const TEST_QUERY: string = 'mountain landscape';

/** Per-request network budget. DDG is a real, occasionally slow remote. */
export const NETWORK_TIMEOUT_MS: number = 30_000;

/** Asserts a value is a non-empty absolute http(s) URL. */
export function assertHttpUrl(value: unknown, label: string): void {
	assert.equal(typeof value, 'string', `${label} should be a string`);
	const url: string = value as string;
	assert.ok(url.length > 0, `${label} should not be empty`);
	assert.match(url, /^https?:\/\//, `${label} should be an absolute http(s) URL`);
}
