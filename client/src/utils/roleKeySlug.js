/**
 * Mirror of shared/utils/roleKeySlug.js — preview only.
 * Collision suffix (_2, _3…) is decided by the API; keep rules in sync with shared.
 */

const ROLE_KEY_MAX_LEN = 64;
const ROLE_KEY_FALLBACK = 'role';

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function slugifyRoleKey(raw) {
  let s = String(raw || '')
    .trim()
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd');

  s = s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

  if (!s) return ROLE_KEY_FALLBACK;
  if (s.length > ROLE_KEY_MAX_LEN) s = s.slice(0, ROLE_KEY_MAX_LEN).replace(/_$/g, '');
  return s || ROLE_KEY_FALLBACK;
}

/**
 * @param {unknown} key
 * @param {'org'|'prj'} ns
 * @returns {string}
 */
export function ensureRoleKeyNamespace(key, ns) {
  const prefix = ns === 'org' ? 'org_' : ns === 'prj' ? 'prj_' : '';
  if (!prefix) return slugifyRoleKey(key);
  let stem = slugifyRoleKey(key).replace(/^(org|prj)_/, '');
  if (!stem) stem = ROLE_KEY_FALLBACK;
  const out = `${prefix}${stem}`;
  if (out.length <= ROLE_KEY_MAX_LEN) return out;
  return out.slice(0, ROLE_KEY_MAX_LEN).replace(/_$/g, '') || `${prefix}${ROLE_KEY_FALLBACK}`.slice(0, ROLE_KEY_MAX_LEN);
}
