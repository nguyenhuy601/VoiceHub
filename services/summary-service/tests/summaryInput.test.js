const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_MAX_MESSAGES,
  isObjectIdString,
  parseBoolStrict,
  parseCreateSummaryInput,
  parseLatestQuery,
} = require('../src/utils/summaryInput');
const { SummaryError } = require('../src/utils/summaryErrors');

const ORG = '64b000000000000000000001';
const ROOM = '64b000000000000000000002';

function assertCode(fn, code) {
  assert.throws(fn, (err) => err instanceof SummaryError && err.code === code);
}

describe('isObjectIdString', () => {
  it('accepts only 24-hex strings', () => {
    assert.equal(isObjectIdString(ORG), true);
    for (const bad of ['abc', ORG.slice(1), `${ORG}a`, [ORG], { $ne: 1 }, 123, null]) {
      assert.equal(isObjectIdString(bad), false, String(bad));
    }
  });
});

describe('parseBoolStrict', () => {
  it('treats only true/1/"true"/"1" as true', () => {
    for (const truthy of [true, 1, 'true', '1']) assert.equal(parseBoolStrict(truthy), true);
    for (const falsy of [false, 'false', 'yes', 0, '', null, undefined, {}]) {
      assert.equal(parseBoolStrict(falsy), false, String(falsy));
    }
  });
});

describe('parseCreateSummaryInput', () => {
  it('normalizes a valid body', () => {
    const out = parseCreateSummaryInput({
      scope: 'org_channel',
      organizationId: ORG,
      roomId: ` ${ROOM} `,
      options: { unreadOnly: 'false', maxMessages: '50', sinceMessageId: ORG },
    });
    assert.deepEqual(out, {
      organizationId: ORG,
      roomId: ROOM,
      options: { unreadOnly: false, sinceMessageId: ORG, maxMessages: 50 },
    });
  });

  it('rejects missing or non-string ids (NoSQL object, array)', () => {
    assertCode(() => parseCreateSummaryInput({ roomId: ROOM }), 'SUMMARY_BAD_REQUEST');
    assertCode(() => parseCreateSummaryInput({ organizationId: { $ne: 1 }, roomId: ROOM }), 'SUMMARY_BAD_REQUEST');
    assertCode(() => parseCreateSummaryInput({ organizationId: ORG, roomId: [ROOM] }), 'SUMMARY_BAD_REQUEST');
    assertCode(() => parseCreateSummaryInput(null), 'SUMMARY_BAD_REQUEST');
  });

  it('rejects unsupported scope', () => {
    assertCode(
      () => parseCreateSummaryInput({ scope: 'dm', organizationId: ORG, roomId: ROOM }),
      'SUMMARY_SCOPE_UNSUPPORTED'
    );
  });

  it('validates sinceMessageId (empty ok, invalid rejected)', () => {
    const empty = parseCreateSummaryInput({ organizationId: ORG, roomId: ROOM, options: { sinceMessageId: '' } });
    assert.equal(empty.options.sinceMessageId, '');
    assertCode(
      () => parseCreateSummaryInput({ organizationId: ORG, roomId: ROOM, options: { sinceMessageId: 'x' } }),
      'SUMMARY_BAD_REQUEST'
    );
  });

  it('clamps maxMessages and falls back to default for invalid values', () => {
    const run = (maxMessages) =>
      parseCreateSummaryInput({ organizationId: ORG, roomId: ROOM, options: { maxMessages } }).options.maxMessages;
    assert.equal(run(0), DEFAULT_MAX_MESSAGES);
    assert.equal(run('abc'), DEFAULT_MAX_MESSAGES);
    assert.equal(run(501), 500);
    assert.equal(run(undefined), DEFAULT_MAX_MESSAGES);
  });

  it('ignores non-object options', () => {
    const out = parseCreateSummaryInput({ organizationId: ORG, roomId: ROOM, options: 'unreadOnly' });
    assert.equal(out.options.unreadOnly, false);
  });
});

describe('parseLatestQuery', () => {
  it('requires both ids', () => {
    assert.deepEqual(parseLatestQuery({ organizationId: ORG, roomId: ROOM }), { organizationId: ORG, roomId: ROOM });
    assertCode(() => parseLatestQuery({ organizationId: ORG }), 'SUMMARY_BAD_REQUEST');
    assertCode(() => parseLatestQuery({ organizationId: [ORG, ORG], roomId: ROOM }), 'SUMMARY_BAD_REQUEST');
  });
});
