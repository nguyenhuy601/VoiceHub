import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { summarizeUserAgent } from '../src/features/adminAccounts/userAgentSummary.js';
import { evaluatePassword } from '../src/features/adminAccounts/passwordPolicy.js';

describe('summarizeUserAgent', () => {
  it('Chrome on Windows', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
    assert.equal(summarizeUserAgent(ua), 'Chrome · Windows');
  });

  it('Edge wins over Chrome token', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 Edg/126.0';
    assert.equal(summarizeUserAgent(ua), 'Edge · Windows');
  });

  it('Safari on iPhone', () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
    assert.equal(summarizeUserAgent(ua), 'Safari · iOS');
  });

  it('Firefox on Linux, Chrome on Android', () => {
    assert.equal(
      summarizeUserAgent('Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0'),
      'Firefox · Linux'
    );
    assert.equal(
      summarizeUserAgent(
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36'
      ),
      'Chrome · Android'
    );
  });

  it('unknown / non-string → empty', () => {
    assert.equal(summarizeUserAgent('curl/8.4.0'), '');
    assert.equal(summarizeUserAgent(''), '');
    assert.equal(summarizeUserAgent(null), '');
    assert.equal(summarizeUserAgent({ ua: 'Chrome/1' }), '');
  });
});

describe('evaluatePassword', () => {
  it('valid strong password', () => {
    assert.equal(evaluatePassword('Abcdef1!').isValid, true);
  });

  it('flags each missing rule', () => {
    const { rules, isValid } = evaluatePassword('abc');
    assert.equal(isValid, false);
    assert.equal(rules.minLength, false);
    assert.equal(rules.upper, false);
    assert.equal(rules.digit, false);
    assert.equal(rules.special, false);
    assert.equal(rules.lower, true);
  });

  it('rejects > 72 bytes (multi-byte chars)', () => {
    const pwd = `Aa1!${'ệ'.repeat(30)}`;
    assert.equal(evaluatePassword(pwd).rules.maxBytes, false);
    assert.equal(evaluatePassword(pwd).isValid, false);
  });

  it('non-string → invalid', () => {
    assert.equal(evaluatePassword(undefined).isValid, false);
  });
});
