/**
 * Heuristic coverage vs golden behaviors (eval harness — not production gate).
 */

const { GOLDEN_BEHAVIORS } = require('../fixtures/vaiTroRoleFixture');

function flattenText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(flattenText).join('\n');
  if (typeof value === 'object') {
    return Object.values(value).map(flattenText).join('\n');
  }
  return String(value);
}

function scoreCoverage(textBlob) {
  const text = flattenText(textBlob);
  const hits = [];
  const misses = [];
  for (const b of GOLDEN_BEHAVIORS) {
    if (b.re.test(text)) hits.push(b.key);
    else misses.push(b.key);
  }
  return {
    hitCount: hits.length,
    total: GOLDEN_BEHAVIORS.length,
    ratio: hits.length / GOLDEN_BEHAVIORS.length,
    hits,
    misses,
  };
}

function scoreFrPack(pack) {
  const frs = pack?.functionalRequirements || [];
  const names = frs.map((f) => `${f.externalId || f.id}: ${f.name}`).join('\n');
  const perFr = frs.map((f) => ({
    id: f.externalId || f.id,
    coverage: scoreCoverage(`${f.name}\n${f.description}\n${f.acceptanceCriteria || ''}`),
  }));
  return {
    frCount: frs.length,
    aggregate: scoreCoverage(
      frs.map((f) => `${f.name}\n${f.description}\n${f.acceptanceCriteria || ''}`).join('\n\n')
    ),
    perFr,
    frIds: frs.map((f) => f.externalId || f.id),
    namesPreview: names.slice(0, 2000),
  };
}

module.exports = {
  scoreCoverage,
  scoreFrPack,
  GOLDEN_BEHAVIORS,
};
