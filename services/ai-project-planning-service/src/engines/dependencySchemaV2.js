/**
 * Dependency analysis schema 2.0 — normalize, validate, project legacy edges.
 *
 * Legacy edge semantics (RULE-05): from = successor (depends on), to = predecessor.
 */

const SCHEMA_VERSION = '2.0';

const BLOCKING_SCOPES = new Set([
  'FULL',
  'INTEGRATION_ONLY',
  'TEST_ONLY',
  'NONE',
]);

const RELATIONSHIPS = new Set(['FS', 'SS', 'FF', 'SF']);
const DEP_KINDS = new Set(['TECHNICAL', 'BUSINESS', 'DATA', 'RESOURCE', 'UNKNOWN']);
const DECISION_STATUSES = new Set(['PROPOSED', 'CONFIRMED', 'REJECTED']);

function clip(s, max = 240) {
  const t = String(s || '').trim().replace(/\s+/g, ' ');
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function pairKey(pred, succ) {
  return `${pred}->${succ}`;
}

/**
 * Project one v2 dependency → legacy edge (for CPM / Risk / Schedule).
 * INTEGRATION_ONLY / NONE → blocking:false; FULL → blocking:true.
 * SAME_AREA / weak soft never critical.
 */
function projectOneLegacyEdge(dep, index = 0) {
  const predecessorTaskId = String(dep.predecessorTaskId || '').trim();
  const successorTaskId = String(dep.successorTaskId || '').trim();
  if (!predecessorTaskId || !successorTaskId) return null;

  const scope = String(dep.blockingScope || 'FULL').toUpperCase();
  const status = String(dep.status || 'PROPOSED').toUpperCase();
  if (status === 'REJECTED') return null;

  let blocking = true;
  if (scope === 'INTEGRATION_ONLY' || scope === 'TEST_ONLY' || scope === 'NONE') {
    blocking = false;
  }
  if (dep.canWorkInParallel === true && scope !== 'FULL') {
    blocking = false;
  }
  // Explicit override from synthesizer / normalize
  if (typeof dep.blocking === 'boolean') {
    blocking = dep.blocking;
  }

  const critical = Boolean(dep.critical) && blocking;
  const relationship = String(dep.relationship || 'FS').toUpperCase();
  const kind =
    relationship === 'FS'
      ? 'depends_on'
      : String(dep.dependencyKind || 'technical').toLowerCase() === 'business'
        ? 'precedes'
        : 'depends_on';

  let type = 'fs';
  const dk = String(dep.dependencyKind || 'TECHNICAL').toUpperCase();
  if (dk === 'TECHNICAL') type = 'technical';
  else if (dk === 'BUSINESS') type = 'fs';
  else type = 'internal';

  return {
    edgeId: String(dep.id || dep.edgeId || `DEP-V2-${index + 1}`).slice(0, 80),
    from: successorTaskId,
    to: predecessorTaskId,
    kind,
    type,
    critical,
    blocking,
    evidence: clip(dep.reason || dep.title || dep.evidence || 'schema_v2', 120),
    source: dep.source || (status === 'CONFIRMED' ? 'explicit' : 'llm'),
    // v2 hints for FE fallback
    blockingScope: scope,
    canWorkInParallel: Boolean(dep.canWorkInParallel),
    decisionStatus: status,
  };
}

function projectLegacyEdges(dependencies = []) {
  const edges = [];
  let i = 0;
  for (const dep of dependencies) {
    if (!dep || typeof dep !== 'object') continue;
    const edge = projectOneLegacyEdge(dep, i);
    if (!edge) continue;
    i += 1;
    edges.push(edge);
  }
  return edges;
}

function detectCycles(dependencies = [], knownIds = new Set()) {
  const adj = new Map();
  for (const id of knownIds) adj.set(id, []);
  for (const dep of dependencies) {
    const pred = String(dep.predecessorTaskId || '');
    const succ = String(dep.successorTaskId || '');
    if (!knownIds.has(pred) || !knownIds.has(succ)) continue;
    // pred before succ → edge pred → succ in topo sense
    if (!adj.has(pred)) adj.set(pred, []);
    adj.get(pred).push(succ);
  }

  const circular = [];
  const color = new Map(); // 0 white, 1 gray, 2 black
  const stack = [];

  function dfs(node) {
    color.set(node, 1);
    stack.push(node);
    for (const next of adj.get(node) || []) {
      const c = color.get(next) || 0;
      if (c === 1) {
        const idx = stack.indexOf(next);
        circular.push(stack.slice(idx).concat(next).join('→'));
      } else if (c === 0) {
        dfs(next);
      }
    }
    stack.pop();
    color.set(node, 2);
  }

  for (const id of knownIds) {
    if ((color.get(id) || 0) === 0) dfs(id);
  }
  return [...new Set(circular)].slice(0, 20);
}

function emptyReview() {
  return { decision: null, reviewerId: null, note: null };
}

function normalizeOneDependency(raw, index, knownIds, candidateKeys) {
  if (!raw || typeof raw !== 'object') return { dep: null, errors: ['invalid_row'] };

  const predecessorTaskId = String(
    raw.predecessorTaskId || raw.to || raw.predecessorId || ''
  ).trim();
  const successorTaskId = String(
    raw.successorTaskId || raw.from || raw.successorId || ''
  ).trim();

  const errors = [];
  if (!predecessorTaskId || !successorTaskId || predecessorTaskId === successorTaskId) {
    errors.push('missing_pair');
  }
  if (predecessorTaskId && !knownIds.has(predecessorTaskId)) {
    errors.push(`missing_pred_${predecessorTaskId}`);
  }
  if (successorTaskId && !knownIds.has(successorTaskId)) {
    errors.push(`missing_succ_${successorTaskId}`);
  }

  // Candidate-gated: if candidateKeys provided and non-empty, require pair in set
  // (or allow when strength was strong via explicit — caller may pass allowUngated)
  if (
    candidateKeys instanceof Set &&
    candidateKeys.size > 0 &&
    !raw._ungated &&
    predecessorTaskId &&
    successorTaskId &&
    !candidateKeys.has(pairKey(predecessorTaskId, successorTaskId))
  ) {
    errors.push('not_in_candidates');
  }

  if (errors.length) return { dep: null, errors };

  let relationship = String(raw.relationship || 'FS').toUpperCase();
  if (!RELATIONSHIPS.has(relationship)) relationship = 'FS';

  let dependencyKind = String(raw.dependencyKind || 'TECHNICAL').toUpperCase();
  if (!DEP_KINDS.has(dependencyKind)) dependencyKind = 'UNKNOWN';

  let blockingScope = String(raw.blockingScope || 'FULL').toUpperCase();
  if (!BLOCKING_SCOPES.has(blockingScope)) {
    if (raw.canWorkInParallel === true) blockingScope = 'INTEGRATION_ONLY';
    else blockingScope = 'FULL';
  }

  let status = String(raw.status || raw.decisionStatus || 'PROPOSED').toUpperCase();
  if (!DECISION_STATUSES.has(status)) status = 'PROPOSED';

  const canWorkInParallel =
    raw.canWorkInParallel === true ||
    blockingScope === 'INTEGRATION_ONLY' ||
    blockingScope === 'TEST_ONLY';

  const confidence = Math.min(
    1,
    Math.max(0, Number(raw.confidence) >= 0 ? Number(raw.confidence) : 0.7)
  );

  const requiredInput =
    raw.requiredInput && typeof raw.requiredInput === 'object'
      ? {
          name: clip(raw.requiredInput.name, 80),
          condition: clip(raw.requiredInput.condition, 160),
          providedByTaskId: String(
            raw.requiredInput.providedByTaskId || predecessorTaskId
          ).trim(),
        }
      : null;

  const impactIfUnmet =
    raw.impactIfUnmet && typeof raw.impactIfUnmet === 'object'
      ? {
          affectedActivity: clip(raw.impactIfUnmet.affectedActivity, 80),
          impact: clip(raw.impactIfUnmet.impact, 160),
          severity: clip(raw.impactIfUnmet.severity || 'MEDIUM', 16),
        }
      : null;

  const evidence = Array.isArray(raw.evidence)
    ? raw.evidence.slice(0, 8).map((e) => {
        if (typeof e === 'string') {
          return { sourceType: 'TASK', sourceId: '', field: '', claim: clip(e, 120) };
        }
        return {
          sourceType: clip(e.sourceType || 'TASK', 24),
          sourceId: String(e.sourceId || ''),
          field: clip(e.field || '', 40),
          claim: clip(e.claim || '', 120),
        };
      })
    : Array.isArray(raw.evidenceRefs)
      ? raw.evidenceRefs.slice(0, 8).map((ref) => ({
          sourceType: 'TASK',
          sourceId: String(ref).split(':')[0] || '',
          field: String(ref).split(':')[1] || '',
          claim: clip(ref, 120),
        }))
      : [];

  const review =
    raw.review && typeof raw.review === 'object'
      ? {
          decision: raw.review.decision ?? null,
          reviewerId: raw.review.reviewerId ?? null,
          note: raw.review.note != null ? clip(raw.review.note, 200) : null,
        }
      : emptyReview();

  const dep = {
    id: String(raw.id || `DEP-${String(index + 1).padStart(3, '0')}`).slice(0, 40),
    predecessorTaskId,
    successorTaskId,
    relationship,
    dependencyKind,
    blockingScope,
    title: clip(raw.title || raw.reason || `${predecessorTaskId} → ${successorTaskId}`, 120),
    reason: clip(raw.reason || raw.evidence || '', 240),
    requiredInput,
    canWorkInParallel,
    parallelCondition: clip(raw.parallelCondition || '', 200) || null,
    impactIfUnmet,
    evidence,
    confidence,
    status,
    review,
    source: raw.source || 'llm',
  };

  return { dep, errors: [] };
}

function normalizeUnresolvedQuestions(rawList, knownIds) {
  if (!Array.isArray(rawList)) return [];
  return rawList
    .slice(0, 40)
    .map((q) => {
      if (!q || typeof q !== 'object') return null;
      const taskId = String(q.taskId || '').trim();
      if (taskId && knownIds.size && !knownIds.has(taskId)) return null;
      return {
        taskId: taskId || null,
        question: clip(q.question, 200),
        whyItMatters: clip(q.whyItMatters || q.why || '', 200),
      };
    })
    .filter((q) => q && q.question);
}

/**
 * Normalize LLM or heuristic synthetic analysis into schema 2.0.
 *
 * @param {object} raw — { dependencies, unresolvedQuestions, analysisStatus? }
 * @param {{ knownTaskIds?: Set|string[], candidateKeys?: Set, allowUngated?: boolean }} opts
 */
function normalizeDependencyAnalysisV2(raw = {}, opts = {}) {
  const knownIds = opts.knownTaskIds instanceof Set
    ? opts.knownTaskIds
    : new Set((opts.knownTaskIds || []).map(String));

  let candidateKeys = opts.candidateKeys instanceof Set ? opts.candidateKeys : null;
  if (opts.allowUngated) candidateKeys = null;

  const depsIn = Array.isArray(raw.dependencies)
    ? raw.dependencies
    : Array.isArray(raw.edges)
      ? raw.edges.map((e) => ({
          // legacy edge → v2 pair (from=succ, to=pred)
          predecessorTaskId: e.to || e.predecessorTaskId,
          successorTaskId: e.from || e.successorTaskId,
          reason: e.evidence,
          blockingScope: e.blocking === false ? 'INTEGRATION_ONLY' : 'FULL',
          canWorkInParallel: e.blocking === false,
          status: 'PROPOSED',
          source: e.source || 'heuristic',
          evidenceRefs: e.evidence ? [e.evidence] : [],
          _ungated: true,
        }))
      : [];

  const dependencies = [];
  const missingTaskReferences = [];
  const duplicateDependencies = [];
  const unsupportedRelationships = [];
  const seen = new Set();
  let idx = 0;

  for (const row of depsIn.slice(0, 80)) {
    if (opts.allowUngated && row && typeof row === 'object') row._ungated = true;
    const { dep, errors } = normalizeOneDependency(row, idx, knownIds, candidateKeys);
    if (errors.includes('not_in_candidates')) continue;
    if (errors.some((e) => e.startsWith('missing_'))) {
      missingTaskReferences.push(...errors.filter((e) => e.startsWith('missing_')));
      continue;
    }
    if (!dep) continue;
    const key = pairKey(dep.predecessorTaskId, dep.successorTaskId);
    if (seen.has(key)) {
      duplicateDependencies.push(key);
      continue;
    }
    seen.add(key);
    if (row?.relationship && !RELATIONSHIPS.has(String(row.relationship).toUpperCase())) {
      unsupportedRelationships.push(String(row.relationship));
    }
    idx += 1;
    dependencies.push(dep);
  }

  const unresolvedQuestions = normalizeUnresolvedQuestions(
    raw.unresolvedQuestions,
    knownIds
  );

  const circularDependencies = detectCycles(dependencies, knownIds);

  const edges = projectLegacyEdges(dependencies);
  const analysisStatus = String(raw.analysisStatus || 'COMPLETED').toUpperCase();

  return {
    schemaVersion: SCHEMA_VERSION,
    analysisStatus,
    dependencies,
    unresolvedQuestions,
    validation: {
      missingTaskReferences: [...new Set(missingTaskReferences)].slice(0, 40),
      duplicateDependencies: duplicateDependencies.slice(0, 40),
      circularDependencies,
      unsupportedRelationships: [...new Set(unsupportedRelationships)].slice(0, 20),
    },
    edges,
    meta: {
      dependencyCount: dependencies.length,
      unresolvedCount: unresolvedQuestions.length,
      edgeCount: edges.length,
      blockingEdgeCount: edges.filter((e) => e.blocking).length,
    },
  };
}

/**
 * Promote tool candidates → provisional PROPOSED deps when LLM is off.
 * Strong rules → FULL blocking; weak → INTEGRATION_ONLY + parallel.
 */
function dependenciesFromCandidates(candidates = [], opts = {}) {
  const knownIds = opts.knownTaskIds instanceof Set
    ? opts.knownTaskIds
    : new Set((opts.knownTaskIds || []).map(String));

  const deps = [];
  let i = 0;
  for (const c of candidates || []) {
    const pred = String(c.predecessorTaskId || '');
    const succ = String(c.successorTaskId || '');
    if (!pred || !succ || pred === succ) continue;
    if (knownIds.size && (!knownIds.has(pred) || !knownIds.has(succ))) continue;

    const rule = String(c.candidateRule || '');
    const strong =
      c.strength === 'strong' ||
      rule === 'EXPLICIT_DEPENDS_ON' ||
      rule === 'CONSUMES_PRODUCER_OUTPUT';

    // Demote same-area and SRS order — never hard-block without LLM judgment
    const weakRule =
      rule === 'SAME_AREA_ORDER' ||
      rule === 'SRS_FR_ORDER' ||
      rule === 'SRS_AC_ORDER' ||
      rule === 'SRS_SAME_UC';

    if (weakRule && !opts.includeWeakAsDeps) {
      continue;
    }

    i += 1;
    deps.push({
      id: `DEP-${String(i).padStart(3, '0')}`,
      predecessorTaskId: pred,
      successorTaskId: succ,
      relationship: 'FS',
      dependencyKind: strong ? 'TECHNICAL' : 'UNKNOWN',
      blockingScope: strong && !weakRule ? 'FULL' : 'INTEGRATION_ONLY',
      title: clip(`${rule}: ${pred} → ${succ}`, 120),
      reason: clip(`Candidate rule ${rule}`, 200),
      canWorkInParallel: !strong || Boolean(weakRule),
      parallelCondition: weakRule
        ? 'Weak ordering hint — confirm before treating as hard FS.'
        : strong
          ? null
          : 'May proceed with mocks until predecessor output is available.',
      evidenceRefs: c.evidenceRefs || [],
      confidence: strong ? 0.85 : 0.45,
      status: 'PROPOSED',
      source: rule === 'EXPLICIT_DEPENDS_ON' ? 'explicit' : 'heuristic',
      _ungated: true,
    });
  }

  return normalizeDependencyAnalysisV2(
    {
      analysisStatus: 'COMPLETED',
      dependencies: deps,
      unresolvedQuestions: (opts.unresolvedTaskIds || []).map((taskId) => ({
        taskId,
        question: 'API contract / predecessor output đã thống nhất chưa?',
        whyItMatters:
          'Cần thông tin này để xác định điều kiện phát triển song song vs chặn tích hợp.',
      })),
    },
    { knownTaskIds: knownIds, allowUngated: true }
  );
}

module.exports = {
  SCHEMA_VERSION,
  BLOCKING_SCOPES,
  normalizeDependencyAnalysisV2,
  projectLegacyEdges,
  projectOneLegacyEdge,
  dependenciesFromCandidates,
  detectCycles,
  pairKey,
};
