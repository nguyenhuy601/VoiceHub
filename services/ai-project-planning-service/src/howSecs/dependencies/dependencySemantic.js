/**
 * Dependencies Semantic — real WBS tasks + SRS only.
 */

const { clip } = require('../../engines/howSemanticLlm');

async function buildDependencySemantic({ pack = {}, container = {}, env = process.env, contextPackage = null, snapshot = null, snapshotId = null } = {}) {
  const { normalizeDeriveLocale } = require('../../semantic/buildSemanticDeriveContext');
  const {
    assembleHowToolContext,
    slimLayer,
    contextAllowsWork,
    missingSlotsFor,
  } = require('../../semanticLayer/howToolContext');
  const locale = normalizeDeriveLocale(
    pack?.aiAnalysis?.deriveLocale || pack?.locale || env.PHASE1_DERIVE_LOCALE
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
    .filter((task) => {
      const level = String(task.level || 'task').toLowerCase();
      return level === 'task' || level === 'subtask' || !task.level;
    })
    .map((task) => ({
      id: task.id,
      title: task.title,
      ...(task.description ? { description: task.description } : {}),
      ...(task.deliverable ? { deliverable: task.deliverable } : {}),
      ...(task.area ? { area: task.area } : {}),
      dependsOn: task.dependsOn || [],
      sourceFrIds: task.sourceFrIds || [],
    }));
  const cited = new Set(taskBrief.flatMap((task) => task.sourceFrIds || []));
  const frRows = layer.requiredData?.functionalRequirements || [];
  const frBrief = (cited.size ? frRows.filter((row) => cited.has(row.id)).concat(frRows.filter((row) => !cited.has(row.id))) : frRows)
    .map((row) => ({ id: row.id, title: row.title, statement: row.statement }));
  const missingSlots = missingSlotsFor('DEPENDENCY', layer);
  const openQuestions = taskBrief.length
    ? []
    : [{ code: 'DEP_NO_TASKS', message: 'Chưa có WBS task thật — không đề xuất phụ thuộc ảo.' }];
  if (!locale) missingSlots.push('business.locale');
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
      layer: slimLayer(layer),
    },
  };
}

module.exports = { buildDependencySemantic };
