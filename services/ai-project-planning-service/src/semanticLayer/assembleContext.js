/**
 * Context retrieval and assembly.
 * Required records come from the relation walk. Fusion only ranks optional hits.
 */

const { sha256 } = require('./hash');
const { reciprocalRankFusion } = require('./rankFusion');
const { splitByAdmission } = require('./admit');

const RETRIEVAL_VERSION = 'retrieval-v1';
const SEARCH_METHODS = ['structured', 'relation', 'keyword', 'vector'];

function estimateTokens(value) {
  if (value == null) return 0;
  return Math.ceil(JSON.stringify(value).length / 4);
}

function buildQuerySeeds(requiredData) {
  const seeds = [];
  for (const [section, items] of Object.entries(requiredData || {})) {
    for (const item of items || []) {
      if (item.entityId) {
        seeds.push({ type: 'entity', value: item.entityId, fromSection: section });
      }
      if (item.term) {
        seeds.push({ type: 'term', value: item.term, fromSection: section });
      }
    }
  }
  return seeds;
}

function emptyRequired(sections) {
  const requiredData = {};
  for (const section of sections) requiredData[section] = [];
  return requiredData;
}

function projectRequired(walked, bound, snapshot) {
  const sections = bound.profile.required.sections;
  const requiredData = emptyRequired(sections);
  const keptItems = [];
  const proposals = [];
  for (const section of sections) {
    const admission = splitByAdmission(walked?.sections?.[section], bound, snapshot);
    requiredData[section] = admission.kept;
    keptItems.push(...admission.kept);
    proposals.push(...admission.proposals);
  }
  const keptIds = new Set(keptItems.map((item) => item.id));
  const expectedIds = Array.isArray(walked?.expectedIds) ? walked.expectedIds : [];
  const missingIds = expectedIds.filter((id) => !keptIds.has(id)).sort();
  return { requiredData, keptItems, proposals, expectedIds, missingIds };
}

function statementOf(item) {
  return {
    id: item.id,
    sourceRecordId: item.sourceRecordId || null,
    excerpt: item.text || item.excerpt || '',
  };
}

function collectConflicts(items) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const groups = [];
  const seen = new Set();
  const involved = new Set();
  for (const item of items) {
    const others = Array.isArray(item.contradicts) ? item.contradicts : [];
    for (const otherId of others) {
      const key = [item.id, otherId].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      const other = byId.get(otherId);
      if (!other) continue;
      involved.add(item.id);
      involved.add(other.id);
      groups.push({
        code: 'CONTRADICTION',
        blocking: item.blocking !== false && other.blocking !== false,
        statements: [statementOf(item), statementOf(other)],
      });
    }
  }
  return { groups, involved };
}

function collapseVersions(items) {
  const byVersion = new Map();
  for (const item of items) {
    const key = `${item.entityId || item.id}@${item.versionId || ''}`;
    const prev = byVersion.get(key);
    if (!prev) {
      byVersion.set(key, {
        ...item,
        sourceRefs: item.sourceRecordId ? [item.sourceRecordId] : [],
      });
      continue;
    }
    if (item.sourceRecordId && !prev.sourceRefs.includes(item.sourceRecordId)) {
      prev.sourceRefs.push(item.sourceRecordId);
    }
  }
  return [...byVersion.values()];
}

function bucketFor(item) {
  if (item.scope === 'historical_evidence' || item.role === 'historical') return 'historicalEvidence';
  if (item.role === 'constraint') return 'constraints';
  return 'definitions';
}

function packSupporting(items, involvedIds, tokenBudget, requiredTokens, unresolvedTokens) {
  const supporting = {
    definitions: [],
    constraints: [],
    historicalEvidence: [],
  };
  let used = requiredTokens + unresolvedTokens;
  const priority = { constraints: 0, definitions: 1, historicalEvidence: 2 };
  const ordered = [...items].sort(
    (left, right) =>
      priority[bucketFor(left)] - priority[bucketFor(right)] ||
      String(left.id).localeCompare(String(right.id))
  );
  for (const item of ordered) {
    if (involvedIds.has(item.id)) continue;
    const cost = estimateTokens(item);
    if (used + cost > tokenBudget) continue;
    supporting[bucketFor(item)].push(item);
    used += cost;
  }
  return supporting;
}

function resolveStatus({ missingIds, conflicts, requiredTokens, tokenBudget }) {
  if (missingIds.length) return 'INSUFFICIENT';
  if (conflicts.some((row) => row.blocking)) return 'CONFLICTED';
  if (requiredTokens > tokenBudget) return 'OVER_BUDGET';
  return 'READY';
}

function provenanceOf(items) {
  return items.map((item) => ({
    entityId: item.entityId || null,
    versionId: item.versionId || null,
    sourceRecordId: item.sourceRecordId || null,
  }));
}

async function assembleContext({ request, caller, ports } = {}) {
  const { bindContextRequest } = require('./bindContextRequest');
  const bound = bindContextRequest(request, caller);
  if (!bound.ok) return bound;
  if (!ports?.loadSnapshot || !ports?.walkRequired) {
    return { ok: false, code: 'PORTS_REQUIRED' };
  }

  const snapshot = await ports.loadSnapshot({
    organizationId: bound.organizationId,
    projectId: bound.projectId,
    snapshotId: bound.snapshotId,
  });
  if (!snapshot) return { ok: false, code: 'SNAPSHOT_REQUIRED', reason: 'not_found' };

  const walked = await ports.walkRequired({ request: bound, snapshot });
  const requiredPack = projectRequired(walked, bound, snapshot);

  let ranked = [];
  if (bound.profile.retrievalMode !== 'none') {
    const seeds = buildQuerySeeds(requiredPack.requiredData);
    const lists = await Promise.all(
      SEARCH_METHODS.map((method) =>
        ports.search
          ? ports.search({ method, seeds, request: bound, snapshot })
          : []
      )
    );
    const admitted = lists.map(
      (list) => splitByAdmission(list, bound, snapshot).kept
    );
    ranked = reciprocalRankFusion(admitted).map((row) => row.item);
    if (bound.profile.forbidSimilarityFill) {
      ranked = ranked.filter((item) => item.role !== 'similar');
    }
    ranked = collapseVersions(ranked);
  }

  const pool = [...requiredPack.keptItems, ...ranked];
  const { groups, involved } = collectConflicts(pool);
  const unresolvedIssues = [...groups];
  if (requiredPack.missingIds.length) {
    unresolvedIssues.push({
      code: 'MISSING_REQUIRED',
      blocking: false,
      missingIds: requiredPack.missingIds,
    });
  }

  const requiredTokens = estimateTokens(requiredPack.requiredData);
  const unresolvedTokens = estimateTokens(unresolvedIssues);
  const supportingContext = packSupporting(
    ranked,
    involved,
    bound.tokenBudget,
    requiredTokens,
    unresolvedTokens
  );

  const approvedFacts = requiredPack.keptItems.filter((item) =>
    ['APPROVED', 'CONFIRMED'].includes(item.reviewStatus)
  );
  const status = resolveStatus({
    missingIds: requiredPack.missingIds,
    conflicts: groups,
    requiredTokens,
    tokenBudget: bound.tokenBudget,
  });

  const includedSupporting = [
    ...supportingContext.definitions,
    ...supportingContext.constraints,
    ...supportingContext.historicalEvidence,
  ];
  const provenance = provenanceOf([...requiredPack.keptItems, ...includedSupporting]);
  const allowedEntityIds = [
    ...new Set(
      [...requiredPack.keptItems, ...includedSupporting]
        .map((item) => item.entityId)
        .filter(Boolean)
    ),
  ].sort();

  const policyVersion = `${String(bound.purpose).toLowerCase()}-context-v1`;
  const assemblyBody = {
    snapshotId: bound.snapshotId,
    purpose: bound.purpose,
    policyVersion,
    retrievalVersion: RETRIEVAL_VERSION,
    historicalEvidencePolicy: bound.historicalEvidencePolicy,
    requiredIds: requiredPack.keptItems
      .map((item) => `${item.id}@${item.versionId || ''}`)
      .sort(),
    supportingIds: includedSupporting
      .map((item) => `${item.id}@${item.versionId || ''}`)
      .sort(),
  };
  const contextHash = sha256(assemblyBody);

  const pack = {
    ok: true,
    contextId: `ctx-${contextHash.slice(0, 16)}`,
    snapshotId: bound.snapshotId,
    purpose: bound.purpose,
    status,
    requiredData: requiredPack.requiredData,
    approvedFacts,
    supportingContext,
    unresolvedIssues,
    allowedEntityIds,
    coverage: {
      requiredCount: requiredPack.expectedIds.length,
      includedCount: requiredPack.expectedIds.length - requiredPack.missingIds.length,
      missingIds: requiredPack.missingIds,
    },
    provenance,
    assembly: {
      policyVersion,
      retrievalVersion: RETRIEVAL_VERSION,
      contextHash,
    },
  };
  if (bound.includeProposals) pack.proposals = requiredPack.proposals;
  return pack;
}

module.exports = {
  estimateTokens,
  buildQuerySeeds,
  assembleContext,
};
