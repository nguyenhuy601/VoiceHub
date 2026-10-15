/**
 * Shared semantic context for Phase WHAT section derive.
 * FR full once; G4 capability/intent merged onto FR — no duplicate JSON dumps in prompt.
 */

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function clip(value, max) {
  const t = String(value ?? '').trim();
  if (!max || t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function frId(row) {
  return String(row?.externalId || row?.logicalId || row?.id || row?.frId || '').trim();
}

/** Index G4 requirements + semanticItems by FR id for enrich (not for prompt dump). */
function g4ByFrId(g4) {
  const map = new Map();
  if (!g4 || typeof g4 !== 'object') return map;
  for (const r of asArray(g4.requirements)) {
    const id = String(r.id || r.frId || r.logicalId || '').trim();
    if (!id) continue;
    map.set(id, {
      capability: clip(r.semanticInterpretation?.capability || r.capability || '', 200),
      intent: clip(r.semanticInterpretation?.intent || r.intent || '', 200),
      actors: asArray(r.actors || r.actor)
        .map((a) => clip(a, 80))
        .filter(Boolean)
        .slice(0, 8),
    });
  }
  for (const item of asArray(g4.semanticItems)) {
    const id = String(item.frId || '').trim();
    if (!id) continue;
    const prev = map.get(id) || {};
    map.set(id, {
      capability: prev.capability || clip(item.semanticInterpretation?.capability || '', 200),
      intent: prev.intent || clip(item.semanticInterpretation?.intent || '', 200),
      actors: prev.actors || [],
    });
  }
  return map;
}

/**
 * Full FR rows for derive (description + AC + actor + module + G4 cap/intent). Caps count, not meaning.
 * @param {object} pack
 * @param {{ proposal?: object, g4Understanding?: object }} [opts]
 * @param {number} [max]
 */
function takeFrFull(pack, opts = {}, max = 48) {
  const g4Map = g4ByFrId(opts.g4Understanding || opts.understanding || null);
  const fromProposal = asArray(opts.proposal?.generated?.functionalRequirements?.items).map((row) => ({
    id: String(row.logicalId || row.id || '').trim(),
    name: clip(row.title || row.name, 200),
    module: clip(row.module || row.moduleLabel, 120),
    actor: clip(row.actor || row.primaryActor, 120),
    description: clip(row.description || row.detail || '', 800),
    acceptanceCriteria: clip(row.acceptanceCriteria || row.ac || '', 600),
    priority: clip(row.priority || '', 40),
    capability: clip(row.semanticInterpretation?.capability || row.capability || '', 200),
    intent: clip(row.semanticInterpretation?.intent || row.intent || '', 200),
  }));
  const fromPack = asArray(pack?.functionalRequirements).map((row) => ({
    id: frId(row),
    name: clip(row.name || row.title, 200),
    module: clip(
      row.module || row.moduleLabel || row.feature || row.functional_scope || row.functionalScope || row.area,
      120
    ),
    actor: clip(row.actor || row.primaryActor || row.userActor, 120),
    description: clip(row.description || '', 800),
    acceptanceCriteria: clip(row.acceptanceCriteria || row.acceptance || row.ac || '', 600),
    priority: clip(row.priority || '', 40),
  }));
  const out = [];
  const seen = new Set();
  for (const row of [...fromProposal, ...fromPack]) {
    if (!row.id && !row.name) continue;
    const key = row.id || row.name;
    if (seen.has(key)) continue;
    seen.add(key);
    const g4 = row.id ? g4Map.get(row.id) : null;
    if (g4) {
      if (!row.capability && g4.capability) row.capability = g4.capability;
      if (!row.intent && g4.intent) row.intent = g4.intent;
      if (!row.actor && g4.actors?.length) row.actor = g4.actors[0];
    }
    // Drop empty optional fields so JSON.stringify stays compact
    if (!row.capability) delete row.capability;
    if (!row.intent) delete row.intent;
    if (!row.priority) delete row.priority;
    if (!row.module) delete row.module;
    if (!row.actor) delete row.actor;
    if (!row.acceptanceCriteria) delete row.acceptanceCriteria;
    out.push(row);
    if (out.length >= max) break;
  }
  return out;
}

function takeBrqFull(pack, opts = {}, max = 30) {
  const canonical = opts.snapshot?.canonicalRaw || pack?.aiAnalysis?.canonicalRaw || null;
  let rows = [];
  if (canonical?.sections) {
    const sec = canonical.sections.businessRequests || canonical.sections.business_requests;
    rows = asArray(sec?.rows || sec);
  }
  if (!rows.length) {
    rows = asArray(pack?.aiAnalysis?.customerRawRows?.businessRequests);
  }
  return rows
    .slice(0, max)
    .map((r) => {
      const row = {
        id: String(r.requestId || r.id || r.externalId || '').trim(),
        statement: clip(r.statement || r.customerStatement || r.description || '', 400),
        businessGoal: clip(r.businessGoal || r.goal || '', 280),
        businessProblem: clip(r.businessProblem || '', 280),
        title: clip(r.title || r.name || '', 160),
        category: clip(r.category || r.priority, 40),
        stakeholder: clip(r.stakeholder || '', 80),
      };
      if (!row.statement) delete row.statement;
      if (!row.businessGoal) delete row.businessGoal;
      if (!row.businessProblem) delete row.businessProblem;
      if (!row.title) delete row.title;
      if (!row.category) delete row.category;
      if (!row.stakeholder) delete row.stakeholder;
      return row;
    })
    .filter((r) => r.id || r.statement || r.businessGoal);
}

/**
 * G4 delta only — capability/intent already on frFull; do not re-dump requirements/semanticItems.
 */
function takeRequirementUnderstanding(g4, max = 24) {
  if (!g4 || typeof g4 !== 'object') return null;
  const ambiguities = [];
  for (const r of asArray(g4.requirements).slice(0, max)) {
    const id = String(r.id || r.frId || r.logicalId || '').trim();
    for (const a of asArray(r.ambiguities || r.semanticInterpretation?.ambiguities).slice(0, 3)) {
      ambiguities.push({
        frId: id || undefined,
        field: clip(a.field || '', 60) || undefined,
        issue: clip(a.issue || a.message || '', 160),
      });
      if (ambiguities.length >= max) break;
    }
    if (ambiguities.length >= max) break;
  }
  for (const a of asArray(g4.ambiguities).slice(0, max - ambiguities.length)) {
    ambiguities.push({
      frId: clip(a.frId || a.id || '', 40) || undefined,
      field: clip(a.field || '', 60) || undefined,
      issue: clip(a.issue || a.message || String(a), 160),
    });
  }
  const ambiguityCount = ambiguities.length || asArray(g4.ambiguities).length;
  const conflictCount = asArray(g4.conflicts).length;
  if (!ambiguityCount && !conflictCount) return null;
  return {
    ambiguityCount,
    conflictCount: conflictCount || undefined,
    ambiguities: ambiguities.length ? ambiguities : undefined,
  };
}

function takeEvidenceRefs(evidence, g4, max = 24) {
  return asArray(evidence || g4?.evidence)
    .slice(0, max)
    .map((ev, i) => {
      const row = {
        id: String(ev.id || ev.sourceId || ev.frId || `EV-${i + 1}`).trim(),
        frId: clip(ev.frId || '', 40) || undefined,
        metric: clip(ev.metric || '', 60) || undefined,
      };
      if (!row.frId) delete row.frId;
      if (!row.metric) delete row.metric;
      return row;
    })
    .filter((e) => e.id || e.frId);
}

/**
 * Normalize account UI locale → vi | en (default vi).
 * @param {unknown} raw
 */
function normalizeDeriveLocale(raw) {
  const s = String(raw || '')
    .trim()
    .toLowerCase();
  if (s === 'en' || s.startsWith('en-') || s === 'english') return 'en';
  return 'vi';
}

/**
 * Prompt line forcing proposal language to match account locale.
 * @param {'vi'|'en'} locale
 */
function languageInstruction(locale) {
  const loc = normalizeDeriveLocale(locale);
  if (loc === 'en') {
    return 'OUTPUT LANGUAGE: Write every title, statement, description, and label in English only.';
  }
  return 'OUTPUT LANGUAGE: Viết mọi title, statement, description, nhãn bằng tiếng Việt (không dùng tiếng Anh trừ tên riêng / mã id).';
}

/** Keys already in prompt header / quality aliases — omit from Input JSON. */
const PROMPT_OMIT_KEYS = new Set([
  'frSlim',
  'brqSlim',
  'languageInstruction',
  'deriveInstruction',
  'mode',
  'focus',
  'task',
  'engineId',
]);

/**
 * Compact object for `Input: JSON.stringify(...)` — FR once, no alias dumps.
 * @param {object} input
 */
function toDerivePromptPayload(input) {
  if (!input || typeof input !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(input)) {
    if (PROMPT_OMIT_KEYS.has(k)) continue;
    if (v == null) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length) continue;
    out[k] = v;
  }
  return out;
}

/**
 * Shared semantic block attached to every section derive input.
 * @param {object} pack
 * @param {{ proposal?: object, g4Understanding?: object, evidence?: object[], snapshot?: object, locale?: string }} [opts]
 */
function buildSemanticDeriveContext(pack, opts = {}) {
  const g4 = opts.g4Understanding || opts.understanding || null;
  const locale = normalizeDeriveLocale(opts.locale || pack?.aiAnalysis?.deriveLocale || 'vi');
  return {
    locale,
    languageInstruction: languageInstruction(locale),
    frFull: takeFrFull(pack, opts, 48),
    brqFull: takeBrqFull(pack, opts, 30),
    requirementUnderstanding: takeRequirementUnderstanding(g4, 24),
    evidenceRefs: takeEvidenceRefs(opts.evidence, g4, 24),
  };
}

module.exports = {
  takeFrFull,
  takeBrqFull,
  takeRequirementUnderstanding,
  takeEvidenceRefs,
  normalizeDeriveLocale,
  languageInstruction,
  toDerivePromptPayload,
  buildSemanticDeriveContext,
};
