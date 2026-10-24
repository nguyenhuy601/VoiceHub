/**
 * Architecture sec — input/output shapes (this sec only). Real-data allow-lists.
 */

const LAYERS = Object.freeze([
  'frontend',
  'backend',
  'api',
  'database',
  'external',
  'infrastructure',
]);

const IMPACT_LEVELS = Object.freeze(['high', 'medium', 'low']);

const REQUIRED_SEMANTIC_SLOTS = Object.freeze([
  'business.frBrief',
  'business.projectName',
  'business.locale',
  'upstream.capabilityBrief',
]);

function clip(s, max = 120) {
  const t = String(s || '')
    .trim()
    .replace(/\s+/g, ' ');
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function assertArchitectureProposeItem(row) {
  if (!row || typeof row !== 'object') return { ok: false, reason: 'not_object' };
  if (!clip(row.title || row.component, 1)) return { ok: false, reason: 'missing_title' };
  const layer = String(row.layer || '').toLowerCase();
  if (layer && !LAYERS.includes(layer)) return { ok: false, reason: 'bad_layer' };
  const impact = String(row.impactLevel || '').toLowerCase();
  if (impact && !IMPACT_LEVELS.includes(impact)) return { ok: false, reason: 'bad_impact' };
  return { ok: true };
}

function getMissingSemanticSlots(semantic) {
  const missing = [];
  const biz = semantic?.business || {};
  const up = semantic?.upstream || {};
  if (!clip(biz.locale, 1)) missing.push('business.locale');
  const hasFr = Array.isArray(biz.frBrief) && biz.frBrief.length > 0;
  const hasCap = Array.isArray(up.capabilityBrief) && up.capabilityBrief.length > 0;
  // Need at least one real business/upstream signal — never invent from empty.
  if (!hasFr && !hasCap) {
    missing.push('business.frBrief_or_upstream.capabilityBrief');
  }
  return missing;
}

module.exports = {
  LAYERS,
  IMPACT_LEVELS,
  REQUIRED_SEMANTIC_SLOTS,
  clip,
  assertArchitectureProposeItem,
  getMissingSemanticSlots,
};
