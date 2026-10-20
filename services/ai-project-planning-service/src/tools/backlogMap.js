const { createEvidence } = require('../evidence/evidence');
const {
  runBacklogMapEngine,
  applyBacklogToContainer,
} = require('../engines/backlogMap');

function countFr(pack = {}) {
  if (Array.isArray(pack.functionalRequirements)) return pack.functionalRequirements.length;
  if (Array.isArray(pack.frList)) return pack.frList.length;
  if (Array.isArray(pack.requirements)) return pack.requirements.length;
  return 0;
}

async function backlogMap(input = {}, context = {}) {
  const snapshotId = input.snapshotId || null;
  const container = context.container || input.container || {};
  const pack = context.pack || input.pack || {};
  const planningHints = input.planningHints || context.planningHints || null;
  const capabilities = Array.isArray(container?.analyses?.capability?.items)
    ? container.analyses.capability.items
    : [];

  const frCount = countFr(pack);
  if (!frCount) {
    console.warn('[BacklogMapTool] empty functionalRequirements — backlog stories may be empty');
  }

  const result = runBacklogMapEngine({
    pack,
    capabilities,
    planningHints,
  });
  const updated = applyBacklogToContainer(container, result);
  const storyCount = result.backlog?.stories?.length || 0;
  const unmapped = result.backlog?.unmappedFrIds?.length || 0;
  console.info(
    `[BacklogMapTool] fr=${frCount} stories=${storyCount} unmapped=${unmapped} source=${result.meta?.source || 'deterministic'}`
  );

  const evidence = [
    createEvidence({
      sourceType: 'backlog_map',
      sourceId: result.meta?.source || 'deterministic',
      snapshotId,
      metric: 'backlog_story_count',
      value: storyCount,
      unit: 'count',
      calculatedBy: 'BacklogMapTool',
      ruleId: 'BACKLOG-MAP-001',
    }),
  ];
  if (unmapped > 0) {
    evidence.push(
      createEvidence({
        sourceType: 'backlog_map',
        sourceId: 'unmapped_fr',
        snapshotId,
        metric: 'backlog_unmapped_fr_count',
        value: unmapped,
        unit: 'count',
        calculatedBy: 'BacklogMapTool',
        ruleId: 'BACKLOG-MAP-002',
      })
    );
  }

  return {
    result: {
      backlog: result.backlog,
      meta: result.meta,
      container: updated,
    },
    evidence,
  };
}

module.exports = { backlogMap };
