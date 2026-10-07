const MEETING_LIST_MAX_LIMIT = 100;
const MEETING_LIST_DEFAULT_LIMIT = 50;
const MEETING_TITLE_MAX_LENGTH = 200;
const MEETING_DESCRIPTION_MAX_LENGTH = 500;

const MEETING_ERROR_CODES = Object.freeze({
  NOT_FOUND: 'MEETING_NOT_FOUND',
  FORBIDDEN: 'MEETING_FORBIDDEN',
  NOT_ACTIVE: 'MEETING_NOT_ACTIVE',
  VALIDATION: 'MEETING_VALIDATION_ERROR',
});

/** Field nặng/nhạy cảm — không trả trong list toàn org (admin xem qua GET /:id/recording). */
const MEETING_LIST_SENSITIVE_FIELDS = Object.freeze([
  'transcript',
  'transcriptChunks',
  'summary',
  'summaryStructured',
  'audioStoragePath',
  'tempStoragePath',
]);

const ORG_WIDE_ADMIN_LEVELS = new Set(['system', 'full']);

function createMeetingError(statusCode, errorCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.errorCode = errorCode;
  return err;
}

function clampMeetingListPaging({ page, limit, max = MEETING_LIST_MAX_LIMIT } = {}) {
  const pageNum = Number.parseInt(page, 10);
  const limitNum = Number.parseInt(limit, 10);
  return {
    page: Number.isFinite(pageNum) && pageNum >= 1 ? pageNum : 1,
    limit: Number.isFinite(limitNum) && limitNum >= 1
      ? Math.min(limitNum, max)
      : Math.min(MEETING_LIST_DEFAULT_LIMIT, max),
  };
}

/**
 * List không range / không mine: mặc định chỉ meeting của user;
 * toàn org chỉ khi có organizationId và caller là owner/admin org hoặc system admin.
 */
function buildMeetingListScope({ userOid, organizationId, adminLevel }) {
  if (organizationId && ORG_WIDE_ADMIN_LEVELS.has(adminLevel)) {
    return { scope: 'org', filterPatch: {} };
  }
  return {
    scope: 'user',
    filterPatch: { $or: [{ hostId: userOid }, { 'participants.userId': userOid }] },
  };
}

/** Gọi sau khi enrich ghi âm — các cờ hasAudio/hasTranscript/hasSummary đã được tính từ những field này. */
function omitMeetingListSensitiveFields(meetings) {
  if (!Array.isArray(meetings)) return meetings;
  return meetings.map((meeting) => {
    if (!meeting || typeof meeting !== 'object') return meeting;
    const copy = { ...meeting };
    for (const field of MEETING_LIST_SENSITIVE_FIELDS) delete copy[field];
    return copy;
  });
}

function isActiveMeetingMember(meeting, userId) {
  const uid = String(userId || '').trim();
  if (!meeting || !uid) return false;
  if (String(meeting.hostId?._id || meeting.hostId || '') === uid) return true;
  return (meeting.participants || []).some(
    (p) => String(p?.userId?._id || p?.userId || '') === uid && !p.leftAt
  );
}

/** @returns {'existing'|'member'|null} */
function resolveSelfJoinAccess({ meeting, userId, isOrgMember }) {
  if (isActiveMeetingMember(meeting, userId)) return 'existing';
  if (String(meeting?.organizationId || '').trim() && isOrgMember === true) return 'member';
  return null;
}

function invalidCreateInput(message) {
  return { ok: false, errorCode: MEETING_ERROR_CODES.VALIDATION, message };
}

function validateMeetingCreateInput({ title, description, startTime, startAt } = {}) {
  const cleanTitle = typeof title === 'string' ? title.trim() : '';
  if (!cleanTitle) return invalidCreateInput('Tiêu đề cuộc họp là bắt buộc.');
  if (cleanTitle.length > MEETING_TITLE_MAX_LENGTH) {
    return invalidCreateInput(`Tiêu đề tối đa ${MEETING_TITLE_MAX_LENGTH} ký tự.`);
  }

  let cleanDescription;
  if (description !== undefined && description !== null) {
    if (typeof description !== 'string') return invalidCreateInput('Mô tả không hợp lệ.');
    cleanDescription = description.trim();
    if (cleanDescription.length > MEETING_DESCRIPTION_MAX_LENGTH) {
      return invalidCreateInput(`Mô tả tối đa ${MEETING_DESCRIPTION_MAX_LENGTH} ký tự.`);
    }
  }

  const rawStart = startTime !== undefined && startTime !== null && startTime !== '' ? startTime : startAt;
  let cleanStart;
  if (rawStart !== undefined && rawStart !== null && rawStart !== '') {
    cleanStart = new Date(rawStart);
    if (Number.isNaN(cleanStart.getTime())) return invalidCreateInput('Thời gian bắt đầu không hợp lệ.');
  }

  return {
    ok: true,
    value: { title: cleanTitle, description: cleanDescription, startTime: cleanStart },
  };
}

module.exports = {
  MEETING_LIST_MAX_LIMIT,
  MEETING_LIST_DEFAULT_LIMIT,
  MEETING_TITLE_MAX_LENGTH,
  MEETING_DESCRIPTION_MAX_LENGTH,
  MEETING_ERROR_CODES,
  MEETING_LIST_SENSITIVE_FIELDS,
  createMeetingError,
  clampMeetingListPaging,
  buildMeetingListScope,
  omitMeetingListSensitiveFields,
  resolveSelfJoinAccess,
  validateMeetingCreateInput,
};
