const WARN_V1 = 'warn_v1';
const VN_TZ = 'Asia/Ho_Chi_Minh';

const MESSAGE = {
  date_before_today: 'Date before today',
  start_after_end: 'Start after end',
};

function isWarnV1(project) {
  return String(project?.schedulePolicy || '') === WARN_V1;
}

/** Client không được tự gắn cờ. Xóa field nếu body có gửi. */
function omitClientSchedulePolicy(body) {
  if (!body || typeof body !== 'object') return body;
  if (Object.prototype.hasOwnProperty.call(body, 'schedulePolicy')) {
    delete body.schedulePolicy;
  }
  return body;
}

function todayYmdInVietnam(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: VN_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function toYmd(value) {
  if (value == null || value === '') return '';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    return todayYmdInVietnam(value);
  }
  const match = String(value).trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function warningRow({ code, field, subjectKey }) {
  return {
    code,
    field,
    subjectKey: String(subjectKey || ''),
    message: MESSAGE[code] || '',
  };
}

/**
 * Cảnh báo mềm. Không đọc DB. Caller chỉ gọi khi project đã là warn_v1.
 * endField: expectedEndDate (dự án), endDate (sprint), dueDate (thẻ).
 */
function collectDateWarnings({
  startDate,
  endDate,
  todayYmd,
  subjectKey = '',
  endField = 'endDate',
} = {}) {
  const today = String(todayYmd || '').trim();
  const start = toYmd(startDate);
  const end = toYmd(endDate);
  const out = [];
  if (today && start && start < today) {
    out.push(warningRow({ code: 'date_before_today', field: 'startDate', subjectKey }));
  }
  if (today && end && end < today) {
    out.push(warningRow({ code: 'date_before_today', field: endField, subjectKey }));
  }
  if (start && end && start > end) {
    out.push(warningRow({ code: 'start_after_end', field: 'startDate', subjectKey }));
  }
  return out;
}

/**
 * Thẻ: start sau due khi đã có người nhận và giờ vẫn là 400 của hoursCapacityGuard.
 * Hàm này không trả warning mềm start_after_end trong trường hợp đó.
 */
function collectCardDateWarnings({
  assigneeId,
  estimateHours,
  startDate,
  dueDate,
  todayYmd,
  subjectKey = '',
} = {}) {
  const warnings = collectDateWarnings({
    startDate,
    endDate: dueDate,
    todayYmd,
    subjectKey,
    endField: 'dueDate',
  });
  const hours = Number(estimateHours);
  const hasAssignee = Boolean(assigneeId);
  const start = toYmd(startDate);
  const end = toYmd(dueDate);
  if (hasAssignee && Number.isFinite(hours) && hours > 0 && start && end && start > end) {
    return warnings.filter((row) => row.code !== 'start_after_end');
  }
  return warnings;
}

function dateWarningsForProject(project, range) {
  if (!isWarnV1(project)) return [];
  return collectDateWarnings(range);
}

function cardDateWarningsForProject(project, cardRange) {
  if (!isWarnV1(project)) return [];
  return collectCardDateWarnings(cardRange);
}

function attachScheduleWarnings(doc, warnings) {
  if (!doc || !Array.isArray(warnings) || warnings.length === 0) return doc;
  return { ...doc, scheduleWarnings: warnings };
}

module.exports = {
  WARN_V1,
  isWarnV1,
  omitClientSchedulePolicy,
  todayYmdInVietnam,
  toYmd,
  collectDateWarnings,
  collectCardDateWarnings,
  dateWarningsForProject,
  cardDateWarningsForProject,
  attachScheduleWarnings,
};
