const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  MEETING_ERROR_CODES,
  MEETING_LIST_SENSITIVE_FIELDS,
  createMeetingError,
  clampMeetingListPaging,
  buildMeetingListScope,
  omitMeetingListSensitiveFields,
  resolveSelfJoinAccess,
  validateMeetingCreateInput,
} = require('../src/utils/meetingAccessPolicy');

const USER = 'u1';
const ORG = '507f1f77bcf86cd799439011';

describe('clampMeetingListPaging', () => {
  it('mặc định page 1, limit 50', () => {
    assert.deepEqual(clampMeetingListPaging({}), { page: 1, limit: 50 });
  });
  it('kẹp limit tối đa 100', () => {
    assert.equal(clampMeetingListPaging({ limit: '100000' }).limit, 100);
  });
  it('page < 1 hoặc rác → 1; limit âm → mặc định', () => {
    assert.deepEqual(clampMeetingListPaging({ page: '-3', limit: '-1' }), { page: 1, limit: 50 });
    assert.deepEqual(clampMeetingListPaging({ page: 'abc', limit: '20' }), { page: 1, limit: 20 });
  });
});

describe('buildMeetingListScope', () => {
  const userFilter = { $or: [{ hostId: USER }, { 'participants.userId': USER }] };

  it('user thường → chỉ meeting của mình', () => {
    const r = buildMeetingListScope({ userOid: USER, organizationId: ORG, adminLevel: null });
    assert.equal(r.scope, 'user');
    assert.deepEqual(r.filterPatch, userFilter);
  });
  it('owner/admin org có organizationId → toàn org', () => {
    const r = buildMeetingListScope({ userOid: USER, organizationId: ORG, adminLevel: 'full' });
    assert.equal(r.scope, 'org');
    assert.deepEqual(r.filterPatch, {});
  });
  it('system admin có organizationId → toàn org', () => {
    assert.equal(buildMeetingListScope({ userOid: USER, organizationId: ORG, adminLevel: 'system' }).scope, 'org');
  });
  it('admin không có organizationId → chỉ meeting của mình', () => {
    assert.equal(buildMeetingListScope({ userOid: USER, organizationId: undefined, adminLevel: 'system' }).scope, 'user');
  });
  it('admin cấp hr → chỉ meeting của mình', () => {
    assert.equal(buildMeetingListScope({ userOid: USER, organizationId: ORG, adminLevel: 'hr' }).scope, 'user');
  });
});

describe('omitMeetingListSensitiveFields', () => {
  it('gỡ 6 field, giữ cờ ghi âm, không mutate input', () => {
    const row = {
      _id: 'm1',
      title: 'Họp',
      hasAudio: true,
      hasTranscript: true,
      hasSummary: true,
      recordingStatus: 'ready',
      summaryPreview: 'tóm tắt',
    };
    for (const f of MEETING_LIST_SENSITIVE_FIELDS) row[f] = 'secret';
    const [out] = omitMeetingListSensitiveFields([row]);
    for (const f of MEETING_LIST_SENSITIVE_FIELDS) assert.equal(f in out, false, f);
    assert.equal(out.hasAudio, true);
    assert.equal(out.hasTranscript, true);
    assert.equal(out.hasSummary, true);
    assert.equal(out.summaryPreview, 'tóm tắt');
    assert.equal(row.transcript, 'secret');
  });
  it('không phải mảng → trả nguyên', () => {
    assert.equal(omitMeetingListSensitiveFields(null), null);
  });
});

describe('resolveSelfJoinAccess', () => {
  const base = { hostId: 'host', organizationId: ORG, participants: [{ userId: 'p1' }, { userId: 'left', leftAt: new Date() }] };

  it('host / participant đang có mặt → existing', () => {
    assert.equal(resolveSelfJoinAccess({ meeting: base, userId: 'host', isOrgMember: false }), 'existing');
    assert.equal(resolveSelfJoinAccess({ meeting: base, userId: 'p1', isOrgMember: false }), 'existing');
  });
  it('member org → member', () => {
    assert.equal(resolveSelfJoinAccess({ meeting: base, userId: 'x', isOrgMember: true }), 'member');
    assert.equal(resolveSelfJoinAccess({ meeting: base, userId: 'left', isOrgMember: true }), 'member');
  });
  it('không phải member → null', () => {
    assert.equal(resolveSelfJoinAccess({ meeting: base, userId: 'x', isOrgMember: false }), null);
    assert.equal(resolveSelfJoinAccess({ meeting: base, userId: 'left', isOrgMember: false }), null);
  });
  it('meeting không có organizationId → null kể cả isOrgMember', () => {
    const noOrg = { ...base, organizationId: null };
    assert.equal(resolveSelfJoinAccess({ meeting: noOrg, userId: 'x', isOrgMember: true }), null);
  });
});

describe('validateMeetingCreateInput', () => {
  it('title rỗng / quá 200 → lỗi validation', () => {
    assert.equal(validateMeetingCreateInput({ title: '   ' }).errorCode, MEETING_ERROR_CODES.VALIDATION);
    assert.equal(validateMeetingCreateInput({ title: 'a'.repeat(201) }).ok, false);
    assert.equal(validateMeetingCreateInput({ title: 'a'.repeat(200) }).ok, true);
  });
  it('description quá 500 hoặc sai kiểu → lỗi', () => {
    assert.equal(validateMeetingCreateInput({ title: 'x', description: 'd'.repeat(501) }).ok, false);
    assert.equal(validateMeetingCreateInput({ title: 'x', description: { a: 1 } }).ok, false);
  });
  it('startAt là alias khi thiếu startTime', () => {
    const r = validateMeetingCreateInput({ title: 'x', startAt: '2026-10-05T03:00:00.000Z' });
    assert.equal(r.ok, true);
    assert.equal(r.value.startTime.toISOString(), '2026-10-05T03:00:00.000Z');
  });
  it('startTime ưu tiên hơn startAt', () => {
    const r = validateMeetingCreateInput({
      title: 'x',
      startTime: '2026-10-06T00:00:00.000Z',
      startAt: '2026-10-05T00:00:00.000Z',
    });
    assert.equal(r.value.startTime.toISOString(), '2026-10-06T00:00:00.000Z');
  });
  it('ngày sai → lỗi; không gửi ngày → undefined', () => {
    assert.equal(validateMeetingCreateInput({ title: 'x', startTime: 'not-a-date' }).ok, false);
    assert.equal(validateMeetingCreateInput({ title: 'x' }).value.startTime, undefined);
  });
  it('trim title', () => {
    assert.equal(validateMeetingCreateInput({ title: '  Họp tuần  ' }).value.title, 'Họp tuần');
  });
});

describe('createMeetingError', () => {
  it('gắn statusCode + errorCode', () => {
    const err = createMeetingError(409, MEETING_ERROR_CODES.NOT_ACTIVE, 'Meeting is not active');
    assert.equal(err.statusCode, 409);
    assert.equal(err.errorCode, 'MEETING_NOT_ACTIVE');
  });
});

describe('meeting.controller source contract', () => {
  const src = fs.readFileSync(path.join(__dirname, '../src/controllers/meeting.controller.js'), 'utf8');
  const getMeetingsSrc = src.slice(src.indexOf('async getMeetings('), src.indexOf('async bootstrapMeetingRoom('));

  it('nhánh range và mine vẫn scope $or host/participant', () => {
    const matches = getMeetingsSrc.match(/filter\.\$or = \[\{ hostId: userOid \}, \{ 'participants\.userId': userOid \}\]/g) || [];
    assert.equal(matches.length, 2);
  });
  it('list không range/không mine dùng buildMeetingListScope + clamp + omit sau enrich', () => {
    assert.match(getMeetingsSrc, /buildMeetingListScope\(/);
    assert.match(getMeetingsSrc, /clampMeetingListPaging\(/);
    const enrichIdx = getMeetingsSrc.indexOf('enrichMeetingsWithRecordingFieldsAsync');
    const omitIdx = getMeetingsSrc.indexOf('omitMeetingListSensitiveFields(');
    assert.ok(enrichIdx > 0 && omitIdx > enrichIdx);
    assert.doesNotMatch(getMeetingsSrc, /parseInt\(limit\)/);
  });
  it('addParticipant kiểm resolveSelfJoinAccess trước khi ghi', () => {
    const addSrc = src.slice(src.indexOf('async addParticipant('), src.indexOf('async removeParticipant('));
    const policyIdx = addSrc.indexOf('resolveSelfJoinAccess(');
    const writeIdx = addSrc.indexOf('meetingService.addParticipant(');
    assert.ok(policyIdx > 0 && writeIdx > policyIdx);
  });
  it('createMeeting validate input + kiểm membership', () => {
    const createSrc = src.slice(src.indexOf('async createMeeting('), src.indexOf('async startMeeting('));
    assert.match(createSrc, /validateMeetingCreateInput\(/);
    assert.match(createSrc, /isOrgMember\(/);
  });
});
