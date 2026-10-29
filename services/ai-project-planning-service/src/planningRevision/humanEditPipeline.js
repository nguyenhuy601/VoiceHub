/**
 * Human edit pipeline: keep AI tip → validate → change event → impact → new revision.
 * Does not overwrite prior revision content.
 */

const {
  buildArtifactRevision,
  appendArtifactRevision,
  getCurrentRevisionId,
  getRevisionById,
  ORIGINS,
} = require('./artifactRevision');
const {
  assertBaseRevision,
  buildChangeEvent,
  appendChangeEvent,
} = require('./changeEvent');
const {
  assessHumanEditImpact,
  applyImpactStaleFlags,
} = require('./impactAssessment');
const { newRequestId } = require('./revisionIds');

/**
 * Apply field patches onto a content snapshot (shallow entity map by entityId).
 * @param {object} priorContent
 * @param {Array<{ entityId?: string, field?: string, after?: unknown }>} changes
 */
function applyChangesToContent(priorContent, changes) {
  const content = {
    ...(priorContent || {}),
    tasks: Array.isArray(priorContent?.tasks)
      ? priorContent.tasks.map((t) => ({ ...t }))
      : [],
  };
  const orphaned = Array.isArray(priorContent?.orphaned) ? [...priorContent.orphaned] : [];

  for (const ch of changes || []) {
    const changeType = String(ch.changeType || '').toLowerCase();
    const entityId = String(ch.entityId || '').trim();
    if (changeType === 'remove_task' && entityId) {
      const idx = content.tasks.findIndex((t) => String(t.id) === entityId);
      if (idx >= 0) {
        orphaned.push({
          ...content.tasks[idx],
          orphanedAt: new Date().toISOString(),
          status: 'orphaned',
        });
        content.tasks.splice(idx, 1);
      }
      continue;
    }
    if (!entityId || !ch.field) continue;
    const task = content.tasks.find((t) => String(t.id) === entityId);
    if (task) {
      task[ch.field] = ch.after;
    }
  }
  content.orphaned = orphaned;
  return content;
}

/**
 * @param {object} input
 * @param {object} input.container
 * @param {string} [input.artifactKind]
 * @param {string} input.baseRevisionId
 * @param {Array} input.changes
 * @param {string} [input.reason]
 * @param {{ userId?: string, role?: string }} [input.actor] — must be server-trusted
 * @param {string} [input.requestId]
 * @param {{ cosmetic?: boolean }|null} [input.llmHint]
 * @param {boolean} [input.noSemanticChange]
 */
function applyHumanEdit(input = {}) {
  const kind = String(input.artifactKind || 'wbs').toLowerCase();
  let container = input.container && typeof input.container === 'object' ? input.container : {};
  const currentId = getCurrentRevisionId(container, kind);
  assertBaseRevision(currentId, input.baseRevisionId);

  const requestId = input.requestId || newRequestId();
  // Idempotent: same requestId already recorded
  const existingEvents = container?.planning?.changeEvents;
  if (Array.isArray(existingEvents)) {
    const prior = existingEvents.find((e) => e && e.requestId === requestId);
    if (prior) {
      return {
        container,
        changeEvent: prior,
        impact: null,
        revision: getRevisionById(container, kind, prior.newRevisionId),
        duplicated: true,
      };
    }
  }

  const tip = getRevisionById(container, kind, currentId);
  const priorContent = tip?.content || {};
  const changes = Array.isArray(input.changes) ? input.changes : [];
  if (input.noSemanticChange === true) {
    for (const ch of changes) {
      if (ch && typeof ch === 'object') ch.noSemanticChange = true;
    }
  }

  const impact = assessHumanEditImpact({
    changes,
    llmHint: input.llmHint || null,
  });

  const newContent = applyChangesToContent(priorContent, changes);
  const revision = buildArtifactRevision({
    kind,
    artifactId: tip?.artifactId || `${kind}-01`,
    parentRevisionId: currentId,
    origin: ORIGINS.HUMAN_EDITED,
    content: newContent,
    createdBy: input.actor?.userId || null,
    provenance: {
      origin: ORIGINS.HUMAN_EDITED,
      runId: null,
      toolName: null,
      inputRevisionId: currentId,
      changeRequestId: requestId,
    },
  });

  container = appendArtifactRevision(container, revision);
  container = applyImpactStaleFlags(container, impact);

  // Structure change clears baseline pin (must re-confirm)
  const structure = changes.some((c) =>
    ['add_task', 'remove_task', 'split_task', 'merge_task', 'reparent'].includes(
      String(c?.changeType || '')
    )
  );
  if (structure && container.planning) {
    container = {
      ...container,
      planning: {
        ...container.planning,
        wbsBaselineRevisionId: null,
        wbsBaselineClearedReason: 'structure_edit',
        wbsBaselineClearedAt: new Date().toISOString(),
      },
    };
  }

  const changeEvent = buildChangeEvent({
    action: 'human_edit',
    artifactId: revision.artifactId,
    artifactKind: kind,
    baseRevisionId: currentId,
    newRevisionId: revision.revisionId,
    actor: input.actor || { userId: '', role: null },
    reason: input.reason || '',
    changes,
    impactAssessmentId: impact.impactAssessmentId,
    requestId,
  });

  const appended = appendChangeEvent(container, changeEvent);
  return {
    container: appended.container,
    changeEvent,
    impact,
    revision,
    duplicated: appended.duplicated,
  };
}

module.exports = {
  applyChangesToContent,
  applyHumanEdit,
};
