/**
 * Stable business key from human label (Org / Project roles).
 * Vietnamese: strip diacritics; map đ/Đ → d (NFD does not decompose đ).
 */

const ROLE_KEY_MAX_LEN = 64;
const ROLE_KEY_FALLBACK = 'role';

/**
 * @param {unknown} raw
 * @returns {string}
 */
function slugifyRoleKey(raw) {
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
 * Pick unique key: base, then base_2, base_3, …
 * Truncates base when suffix would exceed max length.
 *
 * @param {string} base
 * @param {Iterable<string>|Set<string>|string[]} existingKeys
 * @returns {string}
 */
/**
 * Ensure custom Org/Project role keys use a stable namespace (no double-prefix).
 * Seed system keys (department_manager, project_manager, …) stay unprefixed.
 *
 * @param {unknown} key
 * @param {'org'|'prj'} ns
 * @returns {string}
 */
function ensureRoleKeyNamespace(key, ns) {
  const prefix = ns === 'org' ? 'org_' : ns === 'prj' ? 'prj_' : '';
  if (!prefix) return slugifyRoleKey(key);
  let stem = slugifyRoleKey(key).replace(/^(org|prj)_/, '');
  if (!stem) stem = ROLE_KEY_FALLBACK;
  const out = `${prefix}${stem}`;
  if (out.length <= ROLE_KEY_MAX_LEN) return out;
  return out.slice(0, ROLE_KEY_MAX_LEN).replace(/_$/g, '') || `${prefix}${ROLE_KEY_FALLBACK}`.slice(0, ROLE_KEY_MAX_LEN);
}

function allocateUniqueRoleKey(base, existingKeys) {
  const taken = existingKeys instanceof Set
    ? existingKeys
    : new Set([...(existingKeys || [])].map((k) => String(k || '').trim()).filter(Boolean));

  let candidateBase = slugifyRoleKey(base);
  if (!taken.has(candidateBase)) return candidateBase;

  let n = 2;
  for (;;) {
    const suffix = `_${n}`;
    const maxBaseLen = ROLE_KEY_MAX_LEN - suffix.length;
    let stem = candidateBase;
    if (stem.length > maxBaseLen) {
      stem = stem.slice(0, maxBaseLen).replace(/_$/g, '');
      if (!stem) stem = ROLE_KEY_FALLBACK.slice(0, Math.max(1, maxBaseLen));
    }
    const candidate = `${stem}${suffix}`;
    if (!taken.has(candidate)) return candidate;
    n += 1;
    if (n > 10000) {
      // Extremely unlikely; avoid infinite loop
      return `${stem}_${Date.now()}`.slice(0, ROLE_KEY_MAX_LEN);
    }
  }
}

module.exports = {
  ROLE_KEY_MAX_LEN,
  ROLE_KEY_FALLBACK,
  slugifyRoleKey,
  ensureRoleKeyNamespace,
  allocateUniqueRoleKey,
};
