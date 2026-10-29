/**
 * Empty Analysis section panel — soft gap, does not block Gate1 submit.
 * Customer Raw: Analysis sections are derived from CR/NFR/context — not Excel Analysis sheets.
 */

import { GATE1_TABLE_BODY_HEIGHT_CLASS } from './gate1SectionTableConfig';

function labelOf(t, key, fallback, vars) {
  const value = typeof t === 'function' ? t(key, vars) : '';
  if (value) return value;
  if (!vars) return fallback;
  return Object.entries(vars).reduce(
    (text, [name, raw]) => text.replace(`{${name}}`, String(raw ?? '')),
    fallback
  );
}

/** Raw has no Analysis sheets — product: LLM/BA derive from CR/NFR/context. */
const RAW_ANALYSIS_DERIVED_SECTIONS = new Set([
  'useCases',
  'businessRules',
  'processes',
  'businessGoals',
  'entities',
  'actors',
  'scope',
  'nonFunctionalRequirements',
]);

const RAW_SOFT_REASONS = new Set([
  'SOURCE_SHEET_ABSENT',
  'SOURCE_SHEET_EMPTY',
  'SOURCE_UNAVAILABLE',
  'NO_DATA',
  'EMPTY',
  'LLM_DISABLED',
  'DERIVE_EMPTY',
  'LLM_QUOTA_EXHAUSTED',
  'LLM_ERROR',
  'DERIVE_LOCKED',
  'RAW_DERIVE_NOT_APPLICABLE',
  'HEURISTIC_FROM_FR',
]);

const REASON_I18N = {
  SOURCE_SHEET_ABSENT: [
    'requirements.phase1Gate1ReasonSheetAbsent',
    'Thiếu nguồn / không có sheet — không đủ dữ liệu để LLM phân tích',
  ],
  SOURCE_SHEET_EMPTY: [
    'requirements.phase1Gate1ReasonSheetEmpty',
    'Không đủ dữ liệu để LLM phân tích (sheet trống)',
  ],
  SOURCE_UNAVAILABLE: [
    'requirements.phase1Gate1ReasonUnavailable',
    'Không đủ dữ liệu để LLM phân tích (nguồn không khả dụng)',
  ],
  NO_DATA: ['requirements.phase1Gate1ReasonNoData', 'Không có dữ liệu phân tích'],
  EMPTY: ['requirements.phase1Gate1ReasonEmpty', 'Section trống'],
  HEURISTIC_FROM_FR: [
    'requirements.phase1Gate1ReasonHeuristicFr',
    'Heuristic từ FR đã tắt — không đủ dữ liệu nguồn để LLM',
  ],
  LLM_DISABLED: [
    'requirements.phase1Gate1ReasonLlmDisabled',
    'LLM tắt — chưa derive section từ CR/NFR/context',
  ],
  DERIVE_EMPTY: [
    'requirements.phase1Gate1ReasonDeriveEmpty',
    'Không derive được section từ CR/NFR/context — cần BA bổ sung hoặc chạy lại AI',
  ],
  LLM_QUOTA_EXHAUSTED: [
    'requirements.phase1Gate1ReasonLlmQuota',
    'LLM hết hạn mức (quota) — nạp DashScope / đổi model rồi chạy lại AI',
  ],
  LLM_ERROR: [
    'requirements.phase1Gate1ReasonLlmError',
    'LLM lỗi khi derive section — kiểm tra API rồi chạy lại AI',
  ],
  DERIVE_LOCKED: [
    'requirements.phase1Gate1ReasonDeriveLocked',
    'Section tạm khóa — đang chỉ derive BG để test workflow',
  ],
  RAW_ANALYSIS_PENDING: [
    'requirements.phase1Gate1ReasonRawAnalysisPending',
    'Chờ phân tích từ CR/NFR/context (không có sheet Analysis trên Customer Raw)',
  ],
  MISSING_PROJECT_START: [
    'requirements.gate2ScheduleReasonMissingStart',
    'Thiếu ngày bắt đầu dự án — heuristic Lịch không xếp được lịch',
  ],
  NO_ASSIGNMENTS: [
    'requirements.gate2ScheduleReasonNoAssignments',
    'Chưa gán người (Phân công) — Lịch chỉ xếp task đã gán hoặc placeholder UNASSIGNED',
  ],
  NO_LEAF_TASKS: [
    'requirements.gate2ScheduleReasonNoLeaves',
    'Chưa có WBS leaf task — chạy HOW / WBS trước khi lập lịch',
  ],
  SCHEDULE_EMPTY: [
    'requirements.gate2ScheduleReasonEmpty',
    'ScheduleTool chưa sinh dòng lịch — chạy lại HOW (Schedule) trên Monitor',
  ],
  MISSING_ACCEPTANCE_CRITERIA: [
    'requirements.gate2ReasonMissingAcceptanceCriteria',
    'Story thiếu AC / acRefs truy vết được — bổ sung ở WHAT rồi chạy lại HOW (WBS)',
  ],
  INVALID_SOURCE_REF: [
    'requirements.gate2ReasonInvalidSourceRef',
    'Tham chiếu nguồn ngoài allowlist — sửa ref FR/UC/NFR/AC hợp lệ',
  ],
  MISSING_REQUIRED_UC_REF: [
    'requirements.gate2ReasonMissingRequiredUcRef',
    'Test Case gắn UC nhưng thiếu/invalid UC ref — sửa sourceUcKey hoặc bỏ intent UC',
  ],
  AC_COVERAGE_GAP: [
    'requirements.gate2ReasonAcCoverageGap',
    'Còn AC/tiêu chí bắt buộc chưa được Task hoặc TC bao phủ — không duyệt phạm vi này cho đến khi đủ',
  ],
  TEST_DETAILS_INCOMPLETE: [
    'requirements.gate2ReasonTestDetailsIncomplete',
    'TC thiếu steps / expected / test data — chưa đủ điều kiện chấp nhận là TC thực thi được',
  ],
};

/**
 * @param {{
 *   sectionLabel?: string,
 *   sectionKey?: string,
 *   status?: string,
 *   coverageReason?: string|null,
 *   isCustomerRawIntake?: boolean,
 *   softHintKey?: string,
 *   softHintFallback?: string,
 *   t?: function,
 * }} props
 */
export default function Gate1MissingSectionPanel({
  sectionLabel = '',
  sectionKey = '',
  status = 'NO_DATA',
  coverageReason = null,
  isCustomerRawIntake = false,
  softHintKey = 'requirements.phase1Gate1MissingSoftHint',
  softHintFallback = 'Không chặn gửi duyệt Gate 1 (chỉ FR là bắt buộc).',
  t,
}) {
  const reasonKey = String(coverageReason || status || 'NO_DATA').toUpperCase();
  const isRawDerivedSection =
    isCustomerRawIntake && RAW_ANALYSIS_DERIVED_SECTIONS.has(String(sectionKey || ''));

  let reasonEntry = REASON_I18N[reasonKey] || REASON_I18N.NO_DATA;
  if (isRawDerivedSection && RAW_SOFT_REASONS.has(reasonKey)) {
    if (reasonKey === 'LLM_DISABLED') reasonEntry = REASON_I18N.LLM_DISABLED;
    else if (reasonKey === 'DERIVE_EMPTY') reasonEntry = REASON_I18N.DERIVE_EMPTY;
    else if (reasonKey === 'LLM_QUOTA_EXHAUSTED') reasonEntry = REASON_I18N.LLM_QUOTA_EXHAUSTED;
    else if (reasonKey === 'LLM_ERROR') reasonEntry = REASON_I18N.LLM_ERROR;
    else if (reasonKey === 'DERIVE_LOCKED') reasonEntry = REASON_I18N.DERIVE_LOCKED;
    else reasonEntry = REASON_I18N.RAW_ANALYSIS_PENDING;
  }
  const reasonText = labelOf(t, reasonEntry[0], reasonEntry[1]);

  return (
    <div
      className={`mt-3 flex ${GATE1_TABLE_BODY_HEIGHT_CLASS} flex-col items-center justify-center rounded-md border border-dashed border-border bg-muted/30 px-4 text-center`}
    >
      <p className="text-sm font-medium text-foreground">
        {labelOf(t, 'requirements.phase1Gate1MissingData', 'Thiếu dữ liệu')}
        {sectionLabel ? ` — ${sectionLabel}` : ''}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{reasonText}</p>
      <p className="mt-2 text-xs text-muted-foreground">
        {labelOf(t, softHintKey, softHintFallback)}
      </p>
    </div>
  );
}

export { RAW_ANALYSIS_DERIVED_SECTIONS };
