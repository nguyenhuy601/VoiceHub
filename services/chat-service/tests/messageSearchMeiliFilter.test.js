process.env.MEILI_HOST = process.env.MEILI_HOST || 'http://meilisearch:7700';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { encodePageToken } = require('@enterprise/shared/pagination/pageToken');

let buildMeiliFilter;

describe('buildMeiliFilter', () => {
  let prevContextCall;
  let prevVisibleToRoom;

  before(() => {
    prevContextCall = process.env.ORG_CONTEXT_CALL;
    prevVisibleToRoom = process.env.ORG_CONTEXT_VISIBLE_TO_ROOM;
    process.env.ORG_CONTEXT_CALL = '0';
    process.env.ORG_CONTEXT_VISIBLE_TO_ROOM = '1';
    // eslint-disable-next-line global-require
    ({ buildMeiliFilter } = require('../src/services/messageSearchEngine.service'));
  });

  after(() => {
    if (prevContextCall === undefined) delete process.env.ORG_CONTEXT_CALL;
    else process.env.ORG_CONTEXT_CALL = prevContextCall;
    if (prevVisibleToRoom === undefined) delete process.env.ORG_CONTEXT_VISIBLE_TO_ROOM;
    else process.env.ORG_CONTEXT_VISIBLE_TO_ROOM = prevVisibleToRoom;
  });

  it('returns null when no roomId and empty allowedRoomIds', () => {
    assert.equal(
      buildMeiliFilter({
        organizationId: 'org1',
        allowedRoomIds: [],
      }),
      null
    );
  });

  it('builds org + not deleted/recalled + single room', () => {
    const f = buildMeiliFilter({
      organizationId: 'org1',
      roomId: 'roomA',
    });
    assert.match(f, /organizationId = "org1"/);
    assert.match(f, /isDeleted = false/);
    assert.match(f, /isRecalled = false/);
    assert.match(f, /roomId = "roomA"/);
    assert.ok(!f.includes('roomId IN'));
  });

  it('uses roomId IN for multiple allowed rooms', () => {
    const f = buildMeiliFilter({
      organizationId: 'org1',
      allowedRoomIds: ['r1', 'r2'],
    });
    assert.match(f, /roomId IN \["r1", "r2"\]/);
  });

  it('adds sender, messageType, hasAttachment, date range', () => {
    const after = '2026-01-01T00:00:00.000Z';
    const before = '2026-02-01T00:00:00.000Z';
    const f = buildMeiliFilter({
      organizationId: 'org1',
      roomId: 'r1',
      senderId: 'u1',
      messageType: 'image',
      hasAttachment: true,
      createdAfter: after,
      createdBefore: before,
    });
    assert.match(f, /senderId = "u1"/);
    assert.match(f, /messageType = "image"/);
    assert.match(f, /hasAttachment = true/);
    assert.match(f, new RegExp(`createdAt >= ${new Date(after).getTime()}`));
    assert.match(f, new RegExp(`createdAt <= ${new Date(before).getTime()}`));
  });

  it('escapes quotes in filter values', () => {
    const f = buildMeiliFilter({
      organizationId: 'org"x',
      roomId: 'r1',
    });
    assert.match(f, /organizationId = "org\\"x"/);
  });

  it('appends pageToken cursor clause', () => {
    const createdAt = new Date('2026-03-01T12:00:00.000Z');
    const id = '507f1f77bcf86cd799439011';
    const pageToken = encodePageToken({ createdAt, id });
    const f = buildMeiliFilter({
      organizationId: 'org1',
      roomId: 'r1',
      pageToken,
    });
    const t = createdAt.getTime();
    assert.match(f, new RegExp(`createdAt < ${t}`));
    assert.match(f, /messageId < "507f1f77bcf86cd799439011"/);
  });
});
