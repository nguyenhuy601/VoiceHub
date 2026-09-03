/**
 * List query + DTO for GET /requirements — meta + denormalized planningReadiness only.
 */

const { pickPlanningReadinessSummary } = require('./requirementPlanningReadiness');

const PACK_LIST_LIMIT = 100;

/** Inclusion select: không hydrate FR / staffingPlan / Mixed blobs. */
const PACK_LIST_SELECT = [
  'status',
  'templateVersion',
  'sourceFileName',
  'projectId',
  'createdBy',
  'createdAt',
  'updatedAt',
  'overview.requirementName',
  'overview.deadline',
  'overview.platform',
  'overview.startDate',
  'overview.priority',
  'aiPlanning.status',
  'aiPlanning.generatedAt',
  'planningReadiness',
].join(' ');

/**
 * AI Create Project Wizard projection — overview + aiPlanning.overlay, không FR / excelPreview.
 * @see GET /requirements/:packId?view=wizard
 */
const PACK_WIZARD_SELECT = [
  'status',
  'templateVersion',
  'sourceFileName',
  'projectId',
  'createdBy',
  'createdAt',
  'updatedAt',
  'submittedBy',
  'submittedAt',
  'approvedBy',
  'approvedAt',
  'overview',
  'aiPlanning',
  'planningReadiness',
].join(' ');

function hasStoredReadiness(row) {
  return row?.planningReadiness != null && typeof row.planningReadiness.score === 'number';
}

function normalizeStoredReadiness(stored) {
  if (!hasStoredReadiness({ planningReadiness: stored })) return null;
  return {
    score: stored.score,
    readyForHeuristic: Boolean(stored.readyForHeuristic),
    readyForFullEngine: Boolean(stored.readyForFullEngine),
    leafCount: Number(stored.leafCount) || 0,
    leavesWithHours: Number(stored.leavesWithHours) || 0,
    allLeavesStaffed: Boolean(stored.allLeavesStaffed),
    missingLeafIds: Array.isArray(stored.missingLeafIds) ? stored.missingLeafIds : [],
  };
}

function queryRequirementPackList(model, filter) {
  return model
    .find(filter)
    .select(PACK_LIST_SELECT)
    .sort({ updatedAt: -1 })
    .limit(PACK_LIST_LIMIT)
    .lean();
}

/**
 * Backfill denormalized planningReadiness for legacy packs missing the field.
 * Batch-loads FR once, persists via bulkWrite (fire-and-forget).
 */
async function ensurePlanningReadinessOnListRows(model, rows) {
  const list = Array.isArray(rows) ? rows : [];
  const missing = list.filter((row) => !hasStoredReadiness(row));
  if (!missing.length) return list;

  const ids = missing.map((row) => row._id).filter(Boolean);
  const fulls = await model
    .find({ _id: { $in: ids } })
    .select('functionalRequirements staffingPlan overview.deadline overview.platform')
    .lean();
  const byId = new Map(fulls.map((row) => [String(row._id), row]));
  const ops = [];

  const enriched = list.map((row) => {
    if (hasStoredReadiness(row)) return row;
    const full = byId.get(String(row._id)) || {};
    const summary = pickPlanningReadinessSummary({
      overview: {
        ...(row.overview || {}),
        ...(full.overview || {}),
      },
      functionalRequirements: full.functionalRequirements || [],
      staffingPlan: full.staffingPlan || {},
    });
    if (row._id) {
      ops.push({
        updateOne: {
          filter: { _id: row._id },
          update: { $set: { planningReadiness: summary } },
        },
      });
    }
    return { ...row, planningReadiness: summary };
  });

  if (ops.length) {
    model.bulkWrite(ops, { ordered: false }).catch(() => {});
  }
  return enriched;
}

function toRequirementPackListItem(row) {
  const overview = row?.overview || {};
  const planning = row?.aiPlanning || {};
  const readiness =
    normalizeStoredReadiness(row?.planningReadiness) || pickPlanningReadinessSummary(row);
  return {
    _id: row?._id,
    status: row?.status,
    templateVersion: row?.templateVersion,
    sourceFileName: row?.sourceFileName || '',
    projectId: row?.projectId || null,
    createdBy: row?.createdBy,
    createdAt: row?.createdAt,
    updatedAt: row?.updatedAt,
    overview: {
      requirementName: overview.requirementName || '',
      deadline: overview.deadline || null,
      startDate: overview.startDate || null,
      platform: Array.isArray(overview.platform) ? overview.platform : [],
      priority: overview.priority || '',
    },
    aiPlanning: {
      status: planning.status || 'none',
      generatedAt: planning.generatedAt || null,
    },
    planningReadiness: readiness,
  };
}

function mapRequirementPackList(rows) {
  return (rows || []).map(toRequirementPackListItem);
}

/**
 * Slim pack DTO for AI wizard — no FR tree / excelPreview / previewTree.
 * Prefer denormalized planningReadiness (do not recompute without FR).
 */
function toRequirementPackWizardItem(row) {
  if (!row || typeof row !== 'object') return null;
  const overview = row.overview || {};
  const planning = row.aiPlanning || {};
  const readiness =
    normalizeStoredReadiness(row.planningReadiness) ||
    (Array.isArray(row.functionalRequirements) && row.functionalRequirements.length
      ? pickPlanningReadinessSummary(row)
      : null);
  return {
    _id: row._id,
    status: row.status,
    templateVersion: row.templateVersion,
    sourceFileName: row.sourceFileName || '',
    projectId: row.projectId || null,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    submittedBy: row.submittedBy || null,
    submittedAt: row.submittedAt || null,
    approvedBy: row.approvedBy || null,
    approvedAt: row.approvedAt || null,
    overview: {
      requirementName: overview.requirementName || '',
      projectObjective: overview.projectObjective || '',
      businessScope: overview.businessScope || '',
      platform: Array.isArray(overview.platform) ? overview.platform : [],
      expectedUsers: overview.expectedUsers || '',
      expectedScale: overview.expectedScale || '',
      deadline: overview.deadline || null,
      startDate: overview.startDate || null,
      budget: overview.budget ?? null,
      budgetCurrency: overview.budgetCurrency || '',
      priority: overview.priority || '',
    },
    aiPlanning: {
      status: planning.status || 'none',
      overlay: planning.overlay || null,
      generatedAt: planning.generatedAt || null,
      sourcePackVersion: planning.sourcePackVersion ?? null,
    },
    planningReadiness: readiness,
  };
}

module.exports = {
  PACK_LIST_LIMIT,
  PACK_LIST_SELECT,
  PACK_WIZARD_SELECT,
  queryRequirementPackList,
  ensurePlanningReadinessOnListRows,
  toRequirementPackListItem,
  toRequirementPackWizardItem,
  mapRequirementPackList,
  hasStoredReadiness,
  normalizeStoredReadiness,
};
