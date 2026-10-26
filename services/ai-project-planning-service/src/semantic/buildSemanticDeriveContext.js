/**
 * Shared semantic context for Phase WHAT section derive.
 * Source FR text stays intact. Capability and intent travel as annotations.
 */

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function clip(value, max) {
  const t = String(value ?? '').trim();
  if (!max || t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function projectCompiledFr(row) {
  const out = {
    id: row.entityId,
    name: row.content?.title || '',
    description: row.content?.description || '',
  };
  if (row.content?.moduleId) out.module = row.content.moduleId;
  const actor = (row.content?.actorIds || [])[0];
  if (actor) out.actor = actor;
  const acceptance = (row.content?.acceptanceCriteria || [])
    .map((item) => item.text)
    .filter(Boolean)
    .join('\n');
  if (acceptance) out.acceptanceCriteria = acceptance;
  if (row.content?.priority) out.priority = row.content.priority;
  return out;
}

function compiledFrRows(compiled) {
  const rows = [];
  const seen = new Set();
  for (const unit of compiled?.workUnits || []) {
    for (const row of unit.entities?.functionalRequirements || []) {
      if (!row?.entityId || seen.has(row.entityId)) continue;
      seen.add(row.entityId);
      rows.push(projectCompiledFr(row));
    }
  }
  return rows;
}

/**
 * Full FR rows for derive. Count and character caps are not applied here.
 * The context compiler decides work units and records anything left out.
 * @param {object} pack
 * @param {{ proposal?: object, frUnderstanding?: object, profile?: string, compiledContext?: object }} [opts]
 */
function takeFrFull(pack, opts = {}) {
  if (opts.compiledContext) return compiledFrRows(opts.compiledContext);
  const { compileContext } = require('../dataPlane/compileContext');
  return compiledFrRows(
    compileContext({
      phase: 'WHAT',
      profile: opts.profile || 'WHAT_DERIVE_UC',
      pack: packForCompile(pack, opts),
      snapshot: opts.snapshot,
      container: opts.container,
      understanding: opts.frUnderstanding || opts.g4Understanding || opts.understanding,
      focusRefs: opts.focusRefs,
      budget: opts.budget,
    })
  );
}

function packForCompile(pack, opts = {}) {
  const proposed = asArray(opts.proposal?.generated?.functionalRequirements?.items).map((row) => ({
    externalId: String(row.logicalId || row.id || '').trim(),
    title: row.title || row.name || '',
    description: row.description || row.detail || '',
    module: row.module || row.moduleLabel || '',
    actor: row.actor || row.primaryActor || '',
    acceptanceCriteria: row.acceptanceCriteria || row.ac || '',
    priority: row.priority || '',
  })).filter((row) => row.externalId || row.title);
  if (!proposed.length) return pack;
  return {
    ...(pack || {}),
    functionalRequirements: [...proposed, ...asArray(pack?.functionalRequirements)],
  };
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
  'workUnits',
  'contextCoverage',
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
 * @param {{ proposal?: object, frUnderstanding?: object, evidence?: object[], snapshot?: object, locale?: string }} [opts]
 */
function buildSemanticDeriveContext(pack, opts = {}) {
  const g4 = opts.frUnderstanding || opts.g4Understanding || opts.understanding || null;
  const locale = normalizeDeriveLocale(opts.locale || pack?.aiAnalysis?.deriveLocale || 'vi');
  const { formatRetrievedContext } = require('../retrieval/formatRetrievedContext');
  const { compileContext } = require('../dataPlane/compileContext');
  const retrieved = formatRetrievedContext(opts.contextPackage);
  const compiled = compileContext({
    phase: 'WHAT',
    profile: opts.profile || 'WHAT_DERIVE_UC',
    pack: packForCompile(pack, opts),
    snapshot: opts.snapshot,
    container: opts.container,
    understanding: g4,
    focusRefs: opts.focusRefs,
    budget: opts.budget,
    snapshotId: opts.snapshotId,
  });
  const frRows = compiledFrRows(compiled);
  const splitUnits = compiled.status === 'needs_split'
    ? (compiled.workUnits || []).map((unit) => ({
        unitId: unit.unitId,
        refs: unit.refs,
        frRows: (unit.entities?.functionalRequirements || []).map(projectCompiledFr),
      }))
    : null;
  return {
    locale,
    languageInstruction: languageInstruction(locale),
    frFull: splitUnits ? splitUnits[0]?.frRows || [] : frRows,
    workUnits: splitUnits || undefined,
    contextStatus: compiled.status,
    contextCoverage: compiled.coverage,
    annotations: compiled.annotations,
    brqFull: takeBrqFull(pack, opts, 30),
    requirementUnderstanding: takeRequirementUnderstanding(g4, 24),
    evidenceRefs: takeEvidenceRefs(opts.evidence, g4, 24),
    retrievedContext: retrieved.items.length ? retrieved.items : undefined,
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
