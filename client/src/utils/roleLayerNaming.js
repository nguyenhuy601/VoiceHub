/**
 * Mirror of shared/utils/roleLayerNaming.js — keep in sync.
 */

export const SYSTEM_ROLE_NAME_PREFIX = 'Gói quyền — ';
export const ORG_ROLE_LABEL_PREFIX = 'Cơ cấu — ';
export const PROJECT_ROLE_LABEL_PREFIX = 'Dự án — ';

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

/** @param {'system'|'org'|'project'} layer */
export function layerPrefix(layer) {
  return LAYER_PREFIX[layer] || '';
}

/** @param {unknown} raw @param {'system'|'org'|'project'} layer */
export function splitLayerLabel(raw, layer) {
  const prefix = layerPrefix(layer);
  const full = String(raw || '').trim();
  if (!prefix) return { prefix: '', suffix: full, hasPrefix: false };
  if (full.startsWith(prefix)) {
    return { prefix, suffix: full.slice(prefix.length).trim(), hasPrefix: true };
  }
  const alt = prefix.replace('—', '-');
  if (alt !== prefix && full.startsWith(alt)) {
    return { prefix, suffix: full.slice(alt.length).trim(), hasPrefix: true };
  }
  return { prefix, suffix: full, hasPrefix: false };
}

/** @param {unknown} raw @param {'system'|'org'|'project'} layer */
export function normalizeLayerLabel(raw, layer) {
  const prefix = layerPrefix(layer);
  const { suffix } = splitLayerLabel(raw, layer);
  const clean = String(suffix || '').trim();
  if (!clean) return '';
  return `${prefix}${clean}`;
}

/** @param {unknown} raw */
export function isTitleLikeSystemRoleName(raw) {
  const { suffix } = splitLayerLabel(raw, 'system');
  const norm = normalizeForMatch(suffix);
  if (!norm) return false;
  return TITLE_LIKE_PATTERNS.some((p) => norm.includes(p));
}

/** @param {unknown} raw */
export function isConfusingPositionTitle(raw) {
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

/** @param {unknown} raw */
export function looksLikeHrPositionForOrgRole(raw) {
  const { suffix } = splitLayerLabel(raw, 'org');
  const norm = normalizeForMatch(suffix);
  if (!norm) return false;
  if (TITLE_LIKE_PATTERNS.some((p) => norm.includes(p))) return false;
  return (
    /\b(senior|junior|intern|qa|backend|frontend|engineer|developer)\b/.test(norm) &&
    !/\b(manager|lead|truong|head|director)\b/.test(norm)
  );
}

/** @param {unknown} raw */
export function looksLikeOrgStructureForProjectRole(raw) {
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

/** @param {string} suffix */
export function rewriteTitleLikeSystemSuffix(suffix) {
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

/** @param {unknown} raw */
export function canonicalizeSystemRoleName(raw) {
  const name = String(raw || '').trim();
  if (!name) return '';
  if (LEGACY_SYSTEM_ROLE_CANONICAL[name]) return LEGACY_SYSTEM_ROLE_CANONICAL[name];

  const { suffix } = splitLayerLabel(name, 'system');
  const rewritten = rewriteTitleLikeSystemSuffix(suffix);
  return normalizeLayerLabel(rewritten, 'system');
}

/** @param {unknown} raw @param {'system'|'org'|'project'} layer */
export function hasLayerPrefix(raw, layer) {
  return splitLayerLabel(raw, layer).hasPrefix;
}
