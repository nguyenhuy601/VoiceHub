/**
 * Naming convention across System / Org / Project role layers.
 * Position (HR) has no forced prefix — titles are intentional.
 */

const SYSTEM_ROLE_NAME_PREFIX = 'Gói quyền — ';
const ORG_ROLE_LABEL_PREFIX = 'Cơ cấu — ';
const PROJECT_ROLE_LABEL_PREFIX = 'Dự án — ';

const LAYER_PREFIX = Object.freeze({
  system: SYSTEM_ROLE_NAME_PREFIX,
  org: ORG_ROLE_LABEL_PREFIX,
  project: PROJECT_ROLE_LABEL_PREFIX,
});

const TITLE_LIKE_PATTERNS = [
  'truong phong',
  'truong nhom',
  'department manager',
  'team manager',
  'director',
  'chuc danh',
  'job title',
  'position',
];

function stripDiacritics(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd');
}

function normalizeForMatch(s) {
  return stripDiacritics(s)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {'system'|'org'|'project'} layer
 * @returns {string}
 */
function layerPrefix(layer) {
  return LAYER_PREFIX[layer] || '';
}

/**
 * @param {unknown} raw
 * @param {'system'|'org'|'project'} layer
 * @returns {{ prefix: string, suffix: string, hasPrefix: boolean }}
 */
function splitLayerLabel(raw, layer) {
  const prefix = layerPrefix(layer);
  const full = String(raw || '').trim();
  if (!prefix) return { prefix: '', suffix: full, hasPrefix: false };
  if (full.startsWith(prefix)) {
    return { prefix, suffix: full.slice(prefix.length).trim(), hasPrefix: true };
  }
  // Accept ASCII hyphen variant typed by users
  const alt = prefix.replace('—', '-');
  if (alt !== prefix && full.startsWith(alt)) {
    return { prefix, suffix: full.slice(alt.length).trim(), hasPrefix: true };
  }
  return { prefix, suffix: full, hasPrefix: false };
}

/**
 * @param {unknown} raw
 * @param {'system'|'org'|'project'} layer
 * @returns {string}
 */
function normalizeLayerLabel(raw, layer) {
  const prefix = layerPrefix(layer);
  const { suffix } = splitLayerLabel(raw, layer);
  const clean = String(suffix || '').trim();
  if (!clean) return '';
  return `${prefix}${clean}`;
}

/**
 * True when System Role suffix looks like a job title / org structure role.
 * @param {unknown} raw
 * @returns {boolean}
 */
function isTitleLikeSystemRoleName(raw) {
  const { suffix } = splitLayerLabel(raw, 'system');
  const norm = normalizeForMatch(suffix);
  if (!norm) return false;
  return TITLE_LIKE_PATTERNS.some((p) => norm.includes(p));
}

/**
 * Position titles should not look like permission packs or other layer prefixes.
 * @param {unknown} raw
 * @returns {boolean}
 */
function isConfusingPositionTitle(raw) {
  const n = normalizeForMatch(raw);
  if (!n) return false;
  if (n.includes('goi quyen')) return true;
  if (n.includes('co cau')) return true;
  if (n.includes('permission pack') || n.includes('permission')) return true;
  const t = String(raw || '').trim();
  if (t.startsWith(SYSTEM_ROLE_NAME_PREFIX)) return true;
  if (t.startsWith(ORG_ROLE_LABEL_PREFIX)) return true;
  if (t.startsWith(PROJECT_ROLE_LABEL_PREFIX)) return true;
  return false;
}

/**
 * Soft-warn when Org Role suffix looks like a pure HR job title (no structure cue).
 * @param {unknown} raw
 * @returns {boolean}
 */
function looksLikeHrPositionForOrgRole(raw) {
  const { suffix } = splitLayerLabel(raw, 'org');
  const norm = normalizeForMatch(suffix);
  if (!norm) return false;
  if (TITLE_LIKE_PATTERNS.some((p) => norm.includes(p))) return false;
  return (
    /\b(senior|junior|intern|qa|backend|frontend|engineer|developer)\b/.test(norm) &&
    !/\b(manager|lead|truong|head|director)\b/.test(norm)
  );
}

/**
 * Soft-warn when Project Role suffix looks like pure org structure.
 * @param {unknown} raw
 * @returns {boolean}
 */
function looksLikeOrgStructureForProjectRole(raw) {
  const { suffix } = splitLayerLabel(raw, 'project');
  const norm = normalizeForMatch(suffix);
  if (!norm) return false;
  return (
    norm.includes('truong phong') ||
    norm.includes('department manager') ||
    norm.includes('team manager') ||
    (norm.includes('truong nhom') && !norm.includes('project'))
  );
}

const LEGACY_SYSTEM_ROLE_CANONICAL = Object.freeze({
  'Quản trị viên': `${SYSTEM_ROLE_NAME_PREFIX}Quản trị`,
  'Nhân sự': `${SYSTEM_ROLE_NAME_PREFIX}Vận hành HR`,
  'Thành viên': `${SYSTEM_ROLE_NAME_PREFIX}Thành viên`,
});

/**
 * Rewrite title-like System Role suffixes into permission-pack style.
 * @param {string} suffix
 * @returns {string}
 */
function rewriteTitleLikeSystemSuffix(suffix) {
  const raw = String(suffix || '').trim();
  if (!raw) return '';
  const norm = normalizeForMatch(raw);

  if (norm === 'quan tri vien' || norm === 'administrator' || norm === 'admin') {
    return 'Quản trị';
  }
  if (norm === 'nhan su' || norm === 'hr' || norm === 'human resources') {
    return 'Vận hành HR';
  }
  if (norm === 'thanh vien' || norm === 'member') {
    return 'Thành viên';
  }

  const dept = raw.match(/^trưởng\s+phòng\s+(.+)$/i);
  if (dept) return `Vận hành ${dept[1].trim()}`;
  if (norm.startsWith('truong phong ')) {
    return `Vận hành ${raw.replace(/^trưởng\s+phòng\s+/i, '').replace(/^truong\s+phong\s+/i, '').trim()}`;
  }
  if (norm === 'truong phong' || norm === 'department manager') {
    return 'Vận hành phòng ban';
  }

  const team = raw.match(/^trưởng\s+nhóm\s+(.+)$/i);
  if (team) return `Vận hành nhóm ${team[1].trim()}`;
  if (norm.startsWith('truong nhom ')) {
    return `Vận hành nhóm ${raw.replace(/^trưởng\s+nhóm\s+/i, '').replace(/^truong\s+nhom\s+/i, '').trim()}`;
  }
  if (norm === 'truong nhom' || norm === 'team manager') {
    return 'Vận hành nhóm';
  }

  if (norm === 'director' || norm === 'giam doc' || norm === 'giám đốc') {
    return 'Vận hành điều hành';
  }

  return raw;
}

/**
 * Canonical System Role display name (prefix + pack-style suffix).
 * Idempotent for names already on convention.
 * @param {unknown} raw
 * @returns {string}
 */
function canonicalizeSystemRoleName(raw) {
  const name = String(raw || '').trim();
  if (!name) return '';
  if (LEGACY_SYSTEM_ROLE_CANONICAL[name]) return LEGACY_SYSTEM_ROLE_CANONICAL[name];

  const { suffix } = splitLayerLabel(name, 'system');
  const rewritten = rewriteTitleLikeSystemSuffix(suffix);
  return normalizeLayerLabel(rewritten, 'system');
}

module.exports = {
  SYSTEM_ROLE_NAME_PREFIX,
  ORG_ROLE_LABEL_PREFIX,
  PROJECT_ROLE_LABEL_PREFIX,
  LAYER_PREFIX,
  LEGACY_SYSTEM_ROLE_CANONICAL,
  layerPrefix,
  splitLayerLabel,
  normalizeLayerLabel,
  isTitleLikeSystemRoleName,
  isConfusingPositionTitle,
  looksLikeHrPositionForOrgRole,
  looksLikeOrgStructureForProjectRole,
  rewriteTitleLikeSystemSuffix,
  canonicalizeSystemRoleName,
};
