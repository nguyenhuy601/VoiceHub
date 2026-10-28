/**
 * Dependencies Semantic — real WBS leaf tasks + cited FR only.
 * Fail-closed when no leaves (no invent / no container bypass).
 */

const { clip } = require('../../engines/howSemanticLlm');

const TASK_DESC_CLIP = 240;
const FR_STATEMENT_CLIP = 280;

function isLeafTaskLevel(level) {
  const token = String(level || 'task').toLowerCase();
  return token === 'task' || token === 'subtask' || !level;
}

function mapTaskBrief(task) {
  if (!task?.id) return null;
  const dependsOn = Array.isArray(task.dependsOn)
    ? task.dependsOn.map(String).filter(Boolean)
    : [];
  const sourceFrIds = Array.isArray(task.sourceFrIds)
    ? task.sourceFrIds.map(String).filter(Boolean)
    : [];
  const description = task.description ? clip(task.description, TASK_DESC_CLIP) : '';
  const deliverable = task.deliverable ? clip(task.deliverable, 160) : '';
  const area = task.area ? clip(task.area, 24) : '';
  const out = {
    id: String(task.id).trim(),
    title: clip(task.title || task.name || task.id, 120),
  };
  if (description) out.description = description;
  if (deliverable) out.deliverable = deliverable;
  if (area) out.area = area;
  if (dependsOn.length) out.dependsOn = dependsOn;
  if (sourceFrIds.length) out.sourceFrIds = sourceFrIds;
  return out;
}

function mapFrBrief(row) {
  if (!row?.id) return null;
  const statement = row.statement ? clip(row.statement, FR_STATEMENT_CLIP) : '';
  const title = row.title ? clip(row.title, 120) : '';
  const out = { id: String(row.id).trim() };
  if (title) out.title = title;
  if (statement) out.statement = statement;
  return out;
}

/**
 * Prompt-only slice — omit layer.requiredData / supportingContext.
 */
function semanticPromptSlice(semantic = {}) {
  return {
    business: {
      locale: semantic.business?.locale || 'vi',
      projectName: semantic.business?.projectName || '',
      frBrief: Array.isArray(semantic.business?.frBrief) ? semantic.business.frBrief : [],
    },
    upstream: {
      taskBrief: Array.isArray(semantic.upstream?.taskBrief) ? semantic.upstream.taskBrief : [],
    },
  };
}

async function buildDependencySemantic({
  pack = {},
  container = {},
  env = process.env,
  contextPackage = null,
  snapshot = null,
  snapshotId = null,
} = {}) {
  const { normalizeDeriveLocale } = require('../../semantic/buildSemanticDeriveContext');
  const {
    assembleHowToolContext,
    slimLayer,
    contextAllowsWork,
    missingSlotsFor,
  } = require('../../semanticLayer/howToolContext');
  const locale = normalizeDeriveLocale(
    pack?.aiAnalysis?.deriveLocale || pack?.locale || env.PHASE1_DERIVE_LOCALE || 'vi'
  );
  const layer = await assembleHowToolContext({
    purpose: 'DEPENDENCY',
    pack,
    container,
    env,
    contextPackage,
    snapshot,
    snapshotId,
  });
  const taskBrief = (layer.requiredData?.tasks || [])
    .filter((task) => isLeafTaskLevel(task.level))
    .map(mapTaskBrief)
    .filter(Boolean);

  const cited = new Set(taskBrief.flatMap((task) => task.sourceFrIds || []));
  const frRows = layer.requiredData?.functionalRequirements || [];
  // Cited-only FR — do not dump full pack into prompt snapshot.
  const frBrief = (
    cited.size ? frRows.filter((row) => cited.has(row.id)) : []
  )
    .map(mapFrBrief)
    .filter(Boolean);

  const missingSlots = missingSlotsFor('DEPENDENCY', layer);
  if (!taskBrief.length) missingSlots.push('upstream.taskBrief');
  const openQuestions = taskBrief.length
    ? []
    : [
        {
          code: 'DEP_NO_TASKS',
          message: 'Chưa có WBS leaf task — chạy WbsTool trước; không đề xuất phụ thuộc ảo.',
        },
      ];

  const layerSlim = slimLayer(layer);
  // Keep gate meta only — strip requiredData so callers never dump it into LLM.
  const layerMeta = layerSlim
    ? {
        status: layerSlim.status,
        unresolvedIssues: layerSlim.unresolvedIssues,
        allowedEntityIds: layerSlim.allowedEntityIds,
        coverage: layerSlim.coverage,
      }
    : null;

  return {
    ok: contextAllowsWork(layer) && taskBrief.length > 0 && Boolean(locale),
    missingSlots,
    openQuestions,
    allowLists: {
      taskIds: taskBrief.map((task) => task.id),
      frIds: frBrief.map((row) => row.id).filter(Boolean),
    },
    semantic: {
      business: {
        locale,
        projectName: clip(pack.overview?.name || pack.name, 80),
        frBrief,
      },
      system: {},
      upstream: { taskBrief },
      layer: layerMeta,
    },
  };
}

module.exports = {
  buildDependencySemantic,
  isLeafTaskLevel,
  mapTaskBrief,
  semanticPromptSlice,
};
