/**
 * Nhãn Vị trí tổ chức (HR Position) theo locale — không tin title EN cứng trong DB.
 */

const LABEL_PATH = 'adminRbac.positionLabel';

/** Master keys (lowercase) — ưu tiên giữ bản lowercase khi trùng UPPER. */
export const MASTER_POSITION_KEYS_LOWER = Object.freeze([
  'engineering_manager',
  'product_manager',
  'team_lead',
  'business_analyst',
  'software_developer',
  'qa_engineer',
  'ux_designer',
  'devops_engineer',
  'scrum_master',
  'technical_lead',
  'intern',
]);

const LEGACY_POSITION_ALIASES = Object.freeze({
  senior_backend: 'SOFTWARE_DEVELOPER',
  senior_frontend: 'SOFTWARE_DEVELOPER',
  junior: 'INTERN',
  qa: 'QA_ENGINEER',
  architect: 'TECHNICAL_LEAD',
  devops: 'DEVOPS_ENGINEER',
  technical_manager: 'ENGINEERING_MANAGER',
});

/** VI fallback khi không có t(). */
export const POSITION_LABEL_VI_FALLBACK = Object.freeze({
  ENGINEERING_MANAGER: 'Quản lý kỹ thuật',
  PRODUCT_MANAGER: 'Quản lý sản phẩm',
  TEAM_LEAD: 'Trưởng nhóm',
  BUSINESS_ANALYST: 'Phân tích nghiệp vụ',
  SOFTWARE_DEVELOPER: 'Kỹ sư phần mềm',
  QA_ENGINEER: 'Kỹ sư QA',
  UX_DESIGNER: 'Thiết kế UX',
  DEVOPS_ENGINEER: 'Kỹ sư DevOps',
  SCRUM_MASTER: 'Scrum Master',
  TECHNICAL_LEAD: 'Trưởng kỹ thuật',
  INTERN: 'Thực tập sinh',
  ACCOUNT_MANAGER: 'Quản lý tài khoản',
  ACCOUNTANT: 'Kế toán',
  ADMINISTRATIVE_SPECIALIST: 'Chuyên viên hành chính',
  AI_ENGINEER: 'Kỹ sư AI',
  BACKEND_ENGINEER: 'Kỹ sư Backend',
  BUSINESS_DEVELOPMENT_EXECUTIVE: 'Chuyên viên phát triển kinh doanh',
  CEO: 'Tổng giám đốc',
  COO: 'Giám đốc điều hành',
  CTO: 'Giám đốc công nghệ',
  CLOUD_ENGINEER: 'Kỹ sư Cloud',
  CUSTOMER_SUCCESS_SPECIALIST: 'Chuyên viên chăm sóc khách hàng',
  DATA_ANALYST: 'Phân tích dữ liệu',
  DATA_ENGINEER: 'Kỹ sư dữ liệu',
  DATA_SCIENTIST: 'Nhà khoa học dữ liệu',
  DATABASE_ADMINISTRATOR: 'Quản trị cơ sở dữ liệu',
  DELIVERY_MANAGER: 'Quản lý bàn giao',
  FINANCE_MANAGER: 'Quản lý tài chính',
  FINANCIAL_ANALYST: 'Phân tích tài chính',
  FRONTEND_ENGINEER: 'Kỹ sư Frontend',
  FULLSTACK_ENGINEER: 'Kỹ sư Full-stack',
  HR_MANAGER: 'Quản lý nhân sự',
  HR_SPECIALIST: 'Chuyên viên nhân sự',
  IT_SUPPORT_SPECIALIST: 'Chuyên viên hỗ trợ IT',
  JUNIOR_SOFTWARE_ENGINEER: 'Kỹ sư phần mềm junior',
  MACHINE_LEARNING_ENGINEER: 'Kỹ sư học máy',
  MANUAL_TESTER: 'Kiểm thử thủ công',
  MLOPS_ENGINEER: 'Kỹ sư MLOps',
  MOBILE_ENGINEER: 'Kỹ sư Mobile',
  PMO_ANALYST: 'Phân tích PMO',
  PRESALES_ENGINEER: 'Kỹ sư pre-sales',
  PRODUCT_DESIGNER: 'Thiết kế sản phẩm',
  TECHNICAL_MANAGER: 'Quản lý kỹ thuật',
});

export function normalizePositionKeyLookup(rawKey) {
  return String(rawKey || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/^_+|_+$/g, '');
}

/** Canonical UPPER key for i18n lookup. */
export function resolvePositionCanonicalKey(rawKey) {
  const lower = normalizePositionKeyLookup(rawKey);
  if (!lower) return '';
  if (LEGACY_POSITION_ALIASES[lower]) return LEGACY_POSITION_ALIASES[lower];
  return lower.toUpperCase();
}

/**
 * Ẩn bản trùng casing (business_analyst vs BUSINESS_ANALYST).
 * Master → giữ lowercase; còn lại → giữ UPPER.
 */
export function isRedundantPositionAliasRow(row, allRows = []) {
  const key = String(row?.key || row?.code || '').trim();
  if (!key) return false;
  const canon = resolvePositionCanonicalKey(key);
  if (!canon) return false;
  const siblings = (allRows || []).filter(
    (r) => resolvePositionCanonicalKey(r?.key || r?.code) === canon
  );
  if (siblings.length <= 1) return false;

  const lowerCanon = canon.toLowerCase();
  const preferred = MASTER_POSITION_KEYS_LOWER.includes(lowerCanon) ? lowerCanon : canon;
  const hasPreferred = siblings.some((r) => String(r?.key || r?.code || '').trim() === preferred);
  if (hasPreferred) return key !== preferred;

  const hasUpper = siblings.some((r) => String(r?.key || r?.code || '').trim() === canon);
  if (hasUpper) return key !== canon;

  const first = String(siblings[0]?.key || siblings[0]?.code || '').trim();
  return key !== first;
}

function lookupI18n(t, basePath, canonical) {
  if (typeof t !== 'function' || !canonical) return '';
  const path = `${basePath}.${canonical}`;
  const value = t(path);
  if (value == null || value === path) return '';
  return String(value).trim();
}

/**
 * @param {string} positionKey
 * @param {string} [fallbackTitle]
 * @param {Function} [t]
 */
export function localizedPositionLabel(positionKey, fallbackTitle, t) {
  const canonical = resolvePositionCanonicalKey(positionKey);
  const fromI18n = lookupI18n(t, LABEL_PATH, canonical);
  if (fromI18n) return fromI18n;
  if (canonical && POSITION_LABEL_VI_FALLBACK[canonical]) {
    return POSITION_LABEL_VI_FALLBACK[canonical];
  }
  const title = String(fallbackTitle || '').trim();
  if (title) return title;
  return canonical || String(positionKey || '').trim();
}
