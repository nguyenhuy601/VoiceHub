/**
 * Master HR Position catalog — SSOT Phase 2.0.
 * Không seed CEO; Position ≠ Project Role ≠ Org Role.
 */

const MASTER_POSITIONS = Object.freeze([
  { key: 'engineering_manager', label: 'Engineering Manager', sortOrder: 10 },
  { key: 'product_manager', label: 'Product Manager', sortOrder: 20 },
  { key: 'team_lead', label: 'Team Lead', sortOrder: 30 },
  { key: 'business_analyst', label: 'Business Analyst', sortOrder: 40 },
  { key: 'software_developer', label: 'Software Developer', sortOrder: 50 },
  { key: 'qa_engineer', label: 'QA Engineer', sortOrder: 60 },
  { key: 'ux_designer', label: 'UX Designer', sortOrder: 70 },
  { key: 'devops_engineer', label: 'DevOps Engineer', sortOrder: 80 },
  { key: 'scrum_master', label: 'Scrum Master', sortOrder: 90 },
  { key: 'technical_lead', label: 'Technical Lead', sortOrder: 100 },
  { key: 'intern', label: 'Intern', sortOrder: 110 },
]);

const MASTER_POSITION_KEYS = Object.freeze(MASTER_POSITIONS.map((p) => p.key));

/** Legacy HR keys → canonical master position key */
const LEGACY_HR_POSITION_KEY_ALIASES = Object.freeze({
  senior_backend: 'software_developer',
  senior_frontend: 'software_developer',
  junior: 'intern',
  qa: 'qa_engineer',
  architect: 'technical_lead',
  devops: 'devops_engineer',
});

function resolveCanonicalPositionKey(rawKey) {
  const raw = String(rawKey || '').trim();
  if (!raw) return '';
  const k = raw.toLowerCase();
  if (MASTER_POSITION_KEYS.includes(k)) return k;
  if (LEGACY_HR_POSITION_KEY_ALIASES[k]) return LEGACY_HR_POSITION_KEY_ALIASES[k];
  const slug = k.replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, '');
  if (MASTER_POSITION_KEYS.includes(slug)) return slug;
  if (LEGACY_HR_POSITION_KEY_ALIASES[slug]) return LEGACY_HR_POSITION_KEY_ALIASES[slug];
  const byLabel = MASTER_POSITIONS.find((p) => String(p.label).toLowerCase() === k);
  return byLabel ? byLabel.key : slug || k;
}

function getPositionByKey(key) {
  const canonical = resolveCanonicalPositionKey(key);
  return MASTER_POSITIONS.find((p) => p.key === canonical) || null;
}

module.exports = {
  MASTER_POSITIONS,
  MASTER_POSITION_KEYS,
  LEGACY_HR_POSITION_KEY_ALIASES,
  resolveCanonicalPositionKey,
  getPositionByKey,
};
