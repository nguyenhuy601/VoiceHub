/**
 * After Gate2 board import — materialize Sprint (planned), DEPENDENCY + RISK PlanningArtifacts.
 * Pure builders exported for unit tests. RULE-03: never status=active.
 */

const { logger } = require('@enterprise/shared');
const Sprint = require('../models/Sprint');
const Task = require('../models/Task');
const PlanningArtifact = require('../models/PlanningArtifact');
const { ensureAiAnalysisContainer } = require('../utils/aiAnalysis/aiAnalysisContainer');
const { textOf } = require('../utils/aiAnalysis/fieldMapCanon');

function clip(s, max) {
  return String(s || '').trim().slice(0, max);
}

/**
 * @param {object} schedulePlan
 * @param {{ packId?: string }} opts
 * @returns {Array<{ sprintKey: string, name: string, goal: string, startDate: string|null, endDate: string|null, pbiIds: string[] }>}
 */
function buildSprintDraftsFromSchedulePlan(schedulePlan, { packId = '' } = {}) {
  const plan = schedulePlan && typeof schedulePlan === 'object' ? schedulePlan : null;
  if (!plan) return [];
  const sprints = Array.isArray(plan.sprints) ? plan.sprints : [];
  const out = [];
  for (let i = 0; i < sprints.length; i += 1) {
    const s = sprints[i];
    if (!s || typeof s !== 'object') continue;
    const sprintKey = clip(s.id || s.sprintId || `s${i + 1}`, 64) || `s${i + 1}`;
    const name = clip(s.name || s.title || `Sprint ${i + 1}`, 180) || `Sprint ${i + 1}`;
    const pbiIds = [
      ...new Set(
        [
          ...(Array.isArray(s.pbiIds) ? s.pbiIds : []),
          ...(Array.isArray(s.taskIds) ? s.taskIds : []),
        ]
          .map((id) => String(id || '').trim())
          .filter(Boolean)
      ),
    ];
    out.push({
      sprintKey,
      externalHint: `gate2:${clip(packId, 24)}:${sprintKey}`.slice(0, 64),
      name,
      goal: clip(s.goal || s.objective || '', 2000),
      startDate: s.startDate ? String(s.startDate).slice(0, 32) : null,
      endDate: s.endDate ? String(s.endDate).slice(0, 32) : null,
      pbiIds,
    });
  }
  return out;
}

function pickDependencyEdges(container) {
  const section =
    container?.analyses?.dependency && typeof container.analyses.dependency === 'object'
      ? container.analyses.dependency
      : {};
  const proposalRaw = Array.isArray(section.proposalEdges) ? section.proposalEdges : [];
  const schedulableRaw = Array.isArray(section.schedulableEdges)
    ? section.schedulableEdges
    : Array.isArray(section.edges)
      ? section.edges
      : [];
  const v2 = Array.isArray(section.dependencies) ? section.dependencies : [];
  if (proposalRaw.length) return proposalRaw;
  if (v2.length) return v2;
  if (schedulableRaw.length) return schedulableRaw;
  if (Array.isArray(container?.planning?.dependencies)) return container.planning.dependencies;
  return [];
}

function edgeEndpoints(dep) {
  const isV2 = Boolean(
    dep?.predecessorTaskId || dep?.successorTaskId || dep?.blockingScope || dep?.schemaVersion
  );
  let predecessorTaskId;
  let successorTaskId;
  if (isV2 || dep.predecessorTaskId || dep.successorTaskId) {
    predecessorTaskId = String(dep.predecessorTaskId || dep.to || '').trim();
    successorTaskId = String(dep.successorTaskId || dep.from || '').trim();
  } else {
    predecessorTaskId = String(dep.to || dep.predecessorId || '').trim();
    successorTaskId = String(dep.from || dep.successorId || '').trim();
  }
  return { predecessorTaskId, successorTaskId };
}

/**
 * @returns {Array<{ externalKey: string, title: string, summary: string, structured: object }>}
 */
function buildDependencyDraftsFromContainer(container, { blueprintIdMap = {} } = {}) {
  const edges = pickDependencyEdges(container);
  const rows = [];
  for (let i = 0; i < edges.length; i += 1) {
    const dep = edges[i];
    if (!dep || typeof dep !== 'object') continue;
    const { predecessorTaskId, successorTaskId } = edgeEndpoints(dep);
    if (!predecessorTaskId && !successorTaskId) continue;
    const id = clip(
      dep.id || dep.edgeId || `${predecessorTaskId}->${successorTaskId}` || `dep-${i}`,
      48
    );
    const externalKey = clip(`DEP-${id}`, 64).replace(/\s+/g, '-') || `DEP-${i + 1}`;
    const predMongo = blueprintIdMap[predecessorTaskId] || null;
    const succMongo = blueprintIdMap[successorTaskId] || null;
    rows.push({
      externalKey,
      title: clip(
        dep.title ||
          dep.relationLabel ||
          `${predecessorTaskId || '?'} → ${successorTaskId || '?'}`,
        240
      ),
      summary: clip(dep.reason || dep.summary || '', 2000),
      structured: {
        predecessorBlueprintId: predecessorTaskId,
        successorBlueprintId: successorTaskId,
        predecessorTaskId: predMongo,
        successorTaskId: succMongo,
        depType: clip(dep.depType || dep.relationship || 'FS', 32),
        critical: Boolean(dep.critical),
        seedSource: 'gate2_promote',
      },
    });
  }
  return rows;
}

/**
 * @returns {Array<{ externalKey: string, title: string, summary: string, structured: object }>}
 */
function buildRiskDraftsFromContainer(container) {
  const riskAnalysis =
    container?.analyses?.risk && typeof container.analyses.risk === 'object'
      ? container.analyses.risk
      : {};
  const items = Array.isArray(riskAnalysis.items)
    ? riskAnalysis.items
    : Array.isArray(container?.planning?.risks)
      ? container.planning.risks
      : [];
  const rows = [];
  for (let i = 0; i < items.length; i += 1) {
    const r = items[i];
    if (!r || typeof r !== 'object') continue;
    const id = clip(r.id || r.riskId || `risk-${i + 1}`, 48);
    const externalKey = clip(`RISK-${id}`, 64).replace(/\s+/g, '-') || `RISK-${i + 1}`;
    rows.push({
      externalKey,
      title: clip(r.name || r.title || id, 240),
      summary: clip(r.summary || r.mitigation || r.description || '', 2000),
      structured: {
        probability: r.probability != null ? r.probability : r.band || '',
        impact: r.impact != null ? r.impact : '',
        band: r.band || r.severity || '',
        mitigation: clip(r.mitigation || '', 2000),
        seedSource: 'gate2_promote',
      },
    });
  }
  return rows;
}

async function loadBlueprintIdMap({ projectId, boardId, importStats }) {
  const fromStats =
    importStats?.blueprintIdMap && typeof importStats.blueprintIdMap === 'object'
      ? { ...importStats.blueprintIdMap }
      : {};
  if (Object.keys(fromStats).length) return fromStats;

  const filter = {
    projectId,
    isActive: true,
    blueprintTaskId: { $nin: [null, ''] },
  };
  if (boardId) filter.boardId = boardId;
  const cards = await Task.find(filter).select('_id blueprintTaskId').lean();
  const map = {};
  for (const c of cards) {
    const bp = String(c.blueprintTaskId || '').trim();
    if (bp) map[bp] = String(c._id);
  }
  return map;
}

async function upsertPlanningDraft({
  organizationId,
  projectId,
  userId,
  kind,
  draft,
}) {
  const existing = await PlanningArtifact.findOne({
    projectId,
    kind,
    externalKey: draft.externalKey,
    isActive: true,
  })
    .select('_id')
    .lean();
  if (existing) {
    return { created: false, id: String(existing._id) };
  }
  const doc = await PlanningArtifact.create({
    organizationId,
    projectId,
    kind,
    externalKey: draft.externalKey,
    title: draft.title,
    summary: draft.summary || '',
    structured: draft.structured || {},
    status: 'draft',
    source: 'import',
    createdBy: userId,
    updatedBy: userId,
    isActive: true,
  });
  return { created: true, id: String(doc._id) };
}

/**
 * Materialize HOW container slices after board import.
 */
async function materializeGate2HowArtifacts({
  userId,
  organizationId,
  projectId,
  boardId,
  packId,
  pack,
  importStats = null,
} = {}) {
  const stats = {
    sprintsCreated: 0,
    sprintsSkipped: 0,
    tasksSprintLinked: 0,
    dependenciesSeeded: 0,
    dependenciesSkipped: 0,
    risksSeeded: 0,
    risksSkipped: 0,
    warnings: [],
  };

  const packObj = pack?.toObject ? pack.toObject() : pack;
  const raw = packObj?.aiAnalysis && typeof packObj.aiAnalysis === 'object' ? packObj.aiAnalysis : {};
  // ensureAiAnalysisContainer drops analyses.dependency / risk — merge back for materialize.
  const container = ensureAiAnalysisContainer(raw);
  if (!container.analyses || typeof container.analyses !== 'object') container.analyses = {};
  if (raw.analyses?.dependency && typeof raw.analyses.dependency === 'object') {
    container.analyses.dependency = raw.analyses.dependency;
  }
  if (raw.analyses?.risk && typeof raw.analyses.risk === 'object') {
    container.analyses.risk = raw.analyses.risk;
  }
  if (Array.isArray(raw.planning?.risks)) {
    container.planning = container.planning || {};
    container.planning.risks = raw.planning.risks;
  }
  if (Array.isArray(raw.planning?.dependencies)) {
    container.planning = container.planning || {};
    container.planning.dependencies = raw.planning.dependencies;
  }
  const blueprintIdMap = await loadBlueprintIdMap({ projectId, boardId, importStats });

  // Sprints (planned only)
  const sprintDrafts = buildSprintDraftsFromSchedulePlan(
    container.planning?.schedulePlan || raw.planning?.schedulePlan,
    {
      packId: String(packId || ''),
    }
  );
  for (const draft of sprintDrafts) {
    try {
      let sprint = await Sprint.findOne({
        projectId,
        boardId: boardId || null,
        name: draft.name,
        status: 'planned',
      });
      if (!sprint) {
        // Hint match via goal prefix for rename-safe idempotent
        sprint = await Sprint.findOne({
          projectId,
          boardId: boardId || null,
          goal: new RegExp(`^\\[${draft.externalHint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]`),
          status: 'planned',
        });
      }
      if (!sprint) {
        const goalPrefix = `[${draft.externalHint}] `;
        sprint = await Sprint.create({
          organizationId,
          projectId,
          boardId: boardId || null,
          name: draft.name,
          goal: `${goalPrefix}${draft.goal || ''}`.slice(0, 2000),
          startDate: draft.startDate ? new Date(draft.startDate) : null,
          endDate: draft.endDate ? new Date(draft.endDate) : null,
          status: 'planned',
          createdBy: userId,
        });
        stats.sprintsCreated += 1;
      } else {
        stats.sprintsSkipped += 1;
      }

      if (draft.pbiIds.length) {
        const mongoIds = draft.pbiIds
          .map((bp) => blueprintIdMap[String(bp)])
          .filter(Boolean);
        const unresolved = draft.pbiIds.filter((bp) => !blueprintIdMap[String(bp)]);
        if (unresolved.length) {
          stats.warnings.push({
            type: 'pbi_unmapped',
            sprint: draft.name,
            pbiIds: unresolved.slice(0, 20),
          });
        }
        if (mongoIds.length) {
          const res = await Task.updateMany(
            {
              projectId,
              _id: { $in: mongoIds },
              isActive: true,
              $or: [{ sprintId: null }, { sprintId: { $exists: false } }],
            },
            { $set: { sprintId: sprint._id } }
          );
          stats.tasksSprintLinked += Number(res.modifiedCount || 0);
        }
      }
    } catch (err) {
      stats.warnings.push({ type: 'sprint_fail', message: err.message || String(err) });
      logger.warn('[promote] gate2 materialize sprint fail', {
        projectId: String(projectId),
        message: String(err.message || err),
      });
    }
  }

  for (const draft of buildDependencyDraftsFromContainer(container, { blueprintIdMap })) {
    try {
      const r = await upsertPlanningDraft({
        organizationId,
        projectId,
        userId,
        kind: 'DEPENDENCY',
        draft,
      });
      if (r.created) stats.dependenciesSeeded += 1;
      else stats.dependenciesSkipped += 1;
    } catch (err) {
      stats.warnings.push({ type: 'dep_fail', key: draft.externalKey, message: err.message });
    }
  }

  for (const draft of buildRiskDraftsFromContainer(container)) {
    try {
      const r = await upsertPlanningDraft({
        organizationId,
        projectId,
        userId,
        kind: 'RISK',
        draft,
      });
      if (r.created) stats.risksSeeded += 1;
      else stats.risksSkipped += 1;
    } catch (err) {
      stats.warnings.push({ type: 'risk_fail', key: draft.externalKey, message: err.message });
    }
  }

  logger.info('[promote] gate2 materialize', {
    projectId: String(projectId),
    sprintsCreated: stats.sprintsCreated,
    dependenciesSeeded: stats.dependenciesSeeded,
    risksSeeded: stats.risksSeeded,
    tasksSprintLinked: stats.tasksSprintLinked,
  });

  return stats;
}

module.exports = {
  buildSprintDraftsFromSchedulePlan,
  buildDependencyDraftsFromContainer,
  buildRiskDraftsFromContainer,
  materializeGate2HowArtifacts,
  pickDependencyEdges,
  textOf,
};
