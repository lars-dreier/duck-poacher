import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import BotChallengeError from '../../src/common/BotChallengeError.ts';

describe('BotChallengeError', () => {
	describe('constructor', () => {
		it('exposes the reason and a fixed name', () => {
			// Given a reason sent by DDG
			const reason: string = 'botnet';

			// When the error is created
			const error = new BotChallengeError(reason);

			// Then it is an Error identifiable by class, name and reason
			assert.ok(error instanceof Error);
			assert.equal(error.name, 'BotChallengeError');
			assert.equal(error.reason, 'botnet');
			assert.equal(error.message, 'DuckDuckGo answered with a bot challenge (botnet) instead of results.');
		});
	});
});
