import assert from 'node:assert/strict';
import type * as http from 'node:http';
import { describe, it } from 'node:test';
import GlobalSearchOptions from '../../src/common/GlobalSearchOptions.ts';

describe('GlobalSearchOptions', () => {
	describe('apply', () => {
		it('sets the p=-2 cookie when safe search is Off', () => {
			// Given options with safe search turned off
			const options = new GlobalSearchOptions({ safeSearch: 'Off' });

			// When they are applied to headers
			const headers: http.OutgoingHttpHeaders = options.apply({ dnt: '1' });

			// Then DDG's "off" cookie is set alongside the existing headers
			assert.deepEqual(headers, { dnt: '1', cookie: 'p=-2' });
		});

		it('sets the p=1 cookie when safe search is Strict', () => {
			// Given options with strict safe search
			const options = new GlobalSearchOptions({ safeSearch: 'Strict' });

			// When they are applied to headers
			const headers: http.OutgoingHttpHeaders = options.apply({ dnt: '1' });

			// Then DDG's "strict" cookie is set
			assert.deepEqual(headers, { dnt: '1', cookie: 'p=1' });
		});

		it('sets no cookie when safe search is Moderate', () => {
			// Given options with moderate safe search
			const options = new GlobalSearchOptions({ safeSearch: 'Moderate' });

			// When they are applied to headers
			const headers: http.OutgoingHttpHeaders = options.apply({ dnt: '1' });

			// Then the headers are unchanged, since moderate is DDG's cookie-less default
			assert.deepEqual(headers, { dnt: '1' });
		});

		it('sets no cookie when no options are given', () => {
			// Given options constructed without arguments
			const options = new GlobalSearchOptions();

			// When they are applied to headers
			const headers: http.OutgoingHttpHeaders = options.apply({ dnt: '1' });

			// Then DDG's moderate default applies and no cookie is set
			assert.deepEqual(headers, { dnt: '1' });
		});

		it('does not mutate the given headers', () => {
			// Given shared base headers and options that add a cookie
			const base: http.OutgoingHttpHeaders = { dnt: '1' };
			const options = new GlobalSearchOptions({ safeSearch: 'Strict' });

			// When they are applied
			options.apply(base);

			// Then the base headers are left untouched for the next request
			assert.deepEqual(base, { dnt: '1' });
		});
	});
});
