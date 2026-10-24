const { createEvidence } = require('../evidence/evidence');
const {
  runSequencingCpm,
  applySequencingCpmToContainer,
} = require('../engines/sequencingCpm');
const { assembleHowToolContext, contextAllowsWork } = require('../semanticLayer/howToolContext');

/** G10 Sequencing / CPM — hours already on WBS leaves. No effort invent. */
async function sequencing(input = {}, context = {}) {
  const snapshotId = input.snapshotId || input.id || null;
  const pack = context.pack || input.pack || {};
  const raw = context.container || input.container || input;
  const layer = await assembleHowToolContext({
    purpose: 'CPM',
    pack,
    container: raw,
    snapshot: input.snapshot || context.snapshot || null,
    snapshotId,
    contextPackage: input.contextPackage || context.contextPackage || null,
  });
  const allowed = new Set((layer.requiredData?.tasks || []).map((task) => task.id));
  const sourceTasks = Array.isArray(raw?.planning?.tasks) ? raw.planning.tasks : [];
  const scoped = contextAllowsWork(layer)
    ? {
        ...raw,
        planning: {
          ...(raw.planning || {}),
          tasks: sourceTasks.filter((task) => allowed.has(String(task.id || task.taskId || ''))),
        },
      }
    : raw;
  const container = contextAllowsWork(layer) ? scoped : raw;
  const engineResult = contextAllowsWork(layer)
    ? runSequencingCpm(container)
    : { status: layer.status || layer.code || 'INSUFFICIENT' };
  const updatedContainer = applySequencingCpmToContainer(container, engineResult);
  const ready = engineResult.status === 'READY';
  const duration = ready ? engineResult.theoreticalCpm?.projectDurationHours ?? 0 : null;
  const evidence = [
    createEvidence({
      sourceType: 'cpm_model',
      sourceId: 'deterministic-v1',
      snapshotId,
      ...(ready
        ? { metric: 'project_duration_hours', value: duration, unit: 'hours' }
        : { value: engineResult.status }),
      calculatedBy: 'SequencingTool',
      ruleId: 'CPM-001',
    }),
  ];
  return { result: { engineResult, container: updatedContainer }, evidence };
}

module.exports = { sequencing };
