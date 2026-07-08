import assert from 'node:assert/strict';
import { buildTweetIntentUrl, countTweetChars, isTweetLengthOk, remainingTweetChars, tweetIdFromUrl } from '../src/composer.js';

assert.equal(countTweetChars('hi'), 2);
assert.equal(remainingTweetChars('x'.repeat(280)), 0);
assert.equal(isTweetLengthOk(''), false);
assert.equal(isTweetLengthOk('x'.repeat(280)), true);
assert.equal(isTweetLengthOk('x'.repeat(281)), false);

const intent = buildTweetIntentUrl('hello world');
assert.equal(new URL(intent).origin, 'https://twitter.com');
assert.equal(new URL(intent).searchParams.get('text'), 'hello world');

assert.equal(tweetIdFromUrl('https://x.com/anish/status/1234567890'), '1234567890');
assert.equal(tweetIdFromUrl('https://twitter.com/anish/statuses/1234567890?s=20'), '1234567890');
assert.equal(tweetIdFromUrl('https://example.com/anish/status/1234567890'), null);

console.log('composer checks passed');
