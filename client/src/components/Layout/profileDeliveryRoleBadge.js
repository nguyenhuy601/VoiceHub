/**
 * Short colored badges for delivery roles in profile menu (project context).
 */

const ROLE_BADGE_DEFS = Object.freeze([
  {
    keys: ['business_analyst'],
    short: 'BA',
    className:
      'bg-sky-500/15 text-sky-800 dark:text-sky-200 border border-sky-500/35',
  },
  {
    keys: ['technical_lead', 'tech_lead'],
    short: 'Tech',
    className:
      'bg-violet-500/15 text-violet-800 dark:text-violet-200 border border-violet-500/35',
  },
  {
    keys: ['product_owner'],
    short: 'PO',
    className:
      'bg-amber-500/15 text-amber-900 dark:text-amber-200 border border-amber-500/35',
  },
  {
    keys: ['project_manager'],
    short: 'PM',
    className:
      'bg-emerald-500/15 text-emerald-900 dark:text-emerald-200 border border-emerald-500/35',
  },
]);

/**
 * @param {string[]|unknown} roleKeys
 * @returns {{ short: string, className: string, key: string }[]}
 */
export function resolveDeliveryRoleBadges(roleKeys) {
  const set = new Set(
    (Array.isArray(roleKeys) ? roleKeys : [])
      .map((k) => String(k || '').trim().toLowerCase())
      .filter(Boolean)
  );
  if (!set.size) return [];
  const out = [];
  const seen = new Set();
  for (const def of ROLE_BADGE_DEFS) {
    const hit = def.keys.find((k) => set.has(k));
    if (!hit || seen.has(def.short)) continue;
    seen.add(def.short);
    out.push({ short: def.short, className: def.className, key: hit });
  }
  return out;
}

/**
 * @param {string} pathname
 * @returns {string}
 */
export function projectIdFromPathname(pathname) {
  const m = String(pathname || '').match(/^\/app\/projects\/([^/]+)/);
  if (!m) return '';
  const id = decodeURIComponent(m[1] || '').trim();
  if (!id || id === 'new' || id === 'new-ai' || id === 'requirements') return '';
  return id;
}
