const { SKILL_REGISTRY_SEED_NAMES } = require('../constants/skillRegistrySeed');

const SKILL_ALIAS_MAP = (() => {
  const map = new Map();
  for (const name of SKILL_REGISTRY_SEED_NAMES) {
    map.set(normalizeKey(name), name);
  }
  map.set('js', 'JavaScript');
  map.set('ts', 'TypeScript');
  map.set('nodejs', 'Node.js');
  map.set('node', 'Node.js');
  map.set('react.js', 'React');
  map.set('reactjs', 'React');
  map.set('vue.js', 'Vue');
  map.set('vuejs', 'Vue');
  map.set('mongo', 'MongoDB');
  map.set('postgres', 'PostgreSQL');
  map.set('postgresql', 'PostgreSQL');
  map.set('postgre sql', 'PostgreSQL');
  map.set('k8s', 'Kubernetes');
  map.set('dotnet', '.NET');
  map.set('sql server', 'SQL Server');
  map.set('fast api', 'FastAPI');
  return map;
})();

function normalizeKey(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function titleCaseSkill(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  if (/^[A-Z0-9./+#-]+$/.test(trimmed) && trimmed.length <= 12) return trimmed;
  return trimmed
    .split(/\s+/)
    .map((part) => {
      if (!part) return '';
      if (/^[A-Z0-9.+/]+$/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(' ');
}

/**
 * @param {string} raw
 * @returns {{ normalizedName: string, suggestedCanonical: string|null, matchedAlias: boolean }}
 */
function normalizeSkillInput(raw) {
  const key = normalizeKey(raw);
  if (!key) {
    return { normalizedName: '', suggestedCanonical: null, matchedAlias: false };
  }
  const aliasHit = SKILL_ALIAS_MAP.get(key);
  if (aliasHit) {
    return {
      normalizedName: normalizeKey(aliasHit),
      suggestedCanonical: aliasHit,
      matchedAlias: true,
    };
  }
  const canonical = titleCaseSkill(raw);
  return {
    normalizedName: normalizeKey(canonical),
    suggestedCanonical: canonical,
    matchedAlias: false,
  };
}

function isSeedSkillName(name) {
  const key = normalizeKey(name);
  return SKILL_REGISTRY_SEED_NAMES.some((n) => normalizeKey(n) === key);
}

module.exports = {
  normalizeKey,
  normalizeSkillInput,
  titleCaseSkill,
  isSeedSkillName,
  SKILL_ALIAS_MAP,
};
