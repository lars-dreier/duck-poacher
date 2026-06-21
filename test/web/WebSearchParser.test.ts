import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import WebSearchParser from '../../src/web/WebSearchParser.ts';

describe('WebSearchParser', () => {
	describe('parse', () => {
		it('maps DDG d.js result entries to WebSearchResult fields', () => {
			// Given a raw d.js body with two organic results and a trailing pagination entry.
			// The first result carries a nested `l` sublinks array to exercise bracket matching.
			const parser = new WebSearchParser();
			const responseText: string = `window.execDeep = function() {DDG.pageLayout.load('d',[`
				+ `{"a":"<b>LM</b> Studio runs models locally","c":"https://lmstudio.ai/","d":"lmstudio.ai",`
				+ `"t":"LM Studio","u":"https://lmstudio.ai/",`
				+ `"l":[{"text":"Download","targetUrl":"https://lmstudio.ai/download"}]},`
				+ `{"a":"Second result snippet","c":"https://example.com/","d":"example.com",`
				+ `"t":"Example","u":"https://example.com/"},`
				+ `{"n":"/d.js?q=lm%20studio&s=10"}`
				+ `]);DDG.duckbar.loadModule('related_searches', {});};`;

			// When the response is parsed
			const results = parser.parse(responseText);

			// Then the trailing pagination entry is dropped and each result keeps DDG's t→title, u→url, a→description mapping
			assert.equal(results.length, 2);
			assert.equal(results[0]?.title, 'LM Studio');
			assert.equal(results[0]?.url, 'https://lmstudio.ai/');
			assert.equal(results[0]?.description, '<b>LM</b> Studio runs models locally');
			assert.equal(results[1]?.title, 'Example');
			assert.equal(results[1]?.url, 'https://example.com/');
			assert.equal(results[1]?.description, 'Second result snippet');
		});

		it('returns an empty list for a response with no results', () => {
			// Given a d.js body whose result array is empty
			const parser = new WebSearchParser();
			const responseText: string = `window.execDeep = function() {DDG.pageLayout.load('d',[]);};`;

			// When the response is parsed
			const results = parser.parse(responseText);

			// Then the parsed list is empty
			assert.equal(results.length, 0);
		});
	});
});
