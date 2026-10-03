/**
 * Empty Analysis section panel — soft gap, does not block Gate1 submit.
 * Customer Raw: Analysis sections are derived from CR/NFR/context — not Excel Analysis sheets.
 */

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
  'interfaces',
  'actors',
  'scope',
  'glossary',
  'assumptions',
  'traceability',
]);

const RAW_SOFT_REASONS = new Set([
  'SOURCE_SHEET_ABSENT',
  'SOURCE_SHEET_EMPTY',
  'SOURCE_UNAVAILABLE',
  'NO_DATA',
  'EMPTY',
  'LLM_DISABLED',
  'DERIVE_EMPTY',
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
  DERIVE_LOCKED: [
    'requirements.phase1Gate1ReasonDeriveLocked',
    'Section tạm khóa — đang chỉ derive BG để test workflow',
  ],
  RAW_ANALYSIS_PENDING: [
    'requirements.phase1Gate1ReasonRawAnalysisPending',
    'Chờ phân tích từ CR/NFR/context (không có sheet Analysis trên Customer Raw)',
  ],
};

/**
 * @param {{
 *   sectionLabel?: string,
 *   sectionKey?: string,
 *   status?: string,
 *   coverageReason?: string|null,
 *   isCustomerRawIntake?: boolean,
 *   t?: function,
 * }} props
 */
export default function Gate1MissingSectionPanel({
  sectionLabel = '',
  sectionKey = '',
  status = 'NO_DATA',
  coverageReason = null,
  isCustomerRawIntake = false,
  t,
}) {
  const reasonKey = String(coverageReason || status || 'NO_DATA').toUpperCase();
  const isRawDerivedSection =
    isCustomerRawIntake && RAW_ANALYSIS_DERIVED_SECTIONS.has(String(sectionKey || ''));

  let reasonEntry = REASON_I18N[reasonKey] || REASON_I18N.NO_DATA;
  if (isRawDerivedSection && RAW_SOFT_REASONS.has(reasonKey)) {
    if (reasonKey === 'LLM_DISABLED') reasonEntry = REASON_I18N.LLM_DISABLED;
    else if (reasonKey === 'DERIVE_EMPTY') reasonEntry = REASON_I18N.DERIVE_EMPTY;
    else if (reasonKey === 'DERIVE_LOCKED') reasonEntry = REASON_I18N.DERIVE_LOCKED;
    else reasonEntry = REASON_I18N.RAW_ANALYSIS_PENDING;
  }
  const reasonText = labelOf(t, reasonEntry[0], reasonEntry[1]);

  return (
    <div className="mt-3 rounded-md border border-dashed border-border bg-muted/30 px-4 py-6 text-center">
      <p className="text-sm font-medium text-foreground">
        {labelOf(t, 'requirements.phase1Gate1MissingData', 'Thiếu dữ liệu')}
        {sectionLabel ? ` — ${sectionLabel}` : ''}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{reasonText}</p>
      <p className="mt-2 text-xs text-muted-foreground">
        {labelOf(
          t,
          'requirements.phase1Gate1MissingSoftHint',
          'Không chặn gửi duyệt Gate 1 (chỉ FR là bắt buộc).'
        )}
      </p>
    </div>
  );
}

export { RAW_ANALYSIS_DERIVED_SECTIONS };
