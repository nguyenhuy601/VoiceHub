const { createEvidence } = require('../evidence/evidence');
const {
  runBacklogMapEngine,
  applyBacklogToContainer,
} = require('../engines/backlogMap');
const { assembleHowToolContext, contextAllowsWork } = require('../semanticLayer/howToolContext');

async function backlogMap(input = {}, context = {}) {
  const snapshotId = input.snapshotId || null;
  const container = context.container || input.container || {};
  const pack = context.pack || input.pack || {};
  const toolData = input.toolData || context.toolData || {};
  const layer = await assembleHowToolContext({
    purpose: 'BACKLOG',
    pack,
    container,
    toolData,
    stories: input.approvedBacklogStructure?.stories,
    snapshot: input.snapshot || context.snapshot || null,
    snapshotId,
    contextPackage: input.contextPackage || context.contextPackage || null,
  });
  if (!contextAllowsWork(layer)) {
    const result = {
      status: layer.status || layer.code,
      backlog: { stories: [], unmappedFrIds: [] },
      meta: { source: layer.status || 'semantic_incomplete' },
    };
    return {
      result: { ...result, container },
      evidence: [
        createEvidence({
          sourceType: 'backlog_map',
          sourceId: result.meta.source,
          snapshotId,
          metric: 'backlog_story_count',
          value: 0,
          unit: 'count',
          calculatedBy: 'BacklogMapTool',
          ruleId: 'BACKLOG-MAP-CONTEXT',
        }),
      ],
    };
  }

  const result = runBacklogMapEngine({
    pack,
    container,
    toolData,
    approvedBacklogStructure:
      input.approvedBacklogStructure || toolData.approvedBacklogStructure || null,
  });
  const updated = applyBacklogToContainer(container, result);
  const storyCount = result.backlog?.stories?.length || 0;
  const unmapped = result.backlog?.unmappedFrIds?.length || 0;
  const source = result.meta?.source || 'missing_approved_backlog_structure';
  console.info(
    `[BacklogMapTool] stories=${storyCount} unmapped=${unmapped} source=${source} status=${result.status || 'ready'}`
  );

  const evidence = [
    createEvidence({
      sourceType: 'backlog_map',
      sourceId: source,
      snapshotId,
      metric: 'backlog_story_count',
      value: storyCount,
      unit: 'count',
      calculatedBy: 'BacklogMapTool',
      ruleId:
        source === 'approved_backlog_structure'
          ? 'BACKLOG-MAP-SOT-001'
          : 'BACKLOG-MAP-FAIL-CLOSED',
    }),
  ];
  if (result.status === 'error' || source === 'missing_approved_backlog_structure') {
    evidence.push(
      createEvidence({
        sourceType: 'backlog_map',
        sourceId: (result.meta?.reasonCodes || []).join('|') || source,
        snapshotId,
        metric: 'backlog_story_count',
        value: 0,
        unit: 'count',
        calculatedBy: 'BacklogMapTool',
        ruleId: 'BACKLOG-MAP-MISSING-SOT',
      })
    );
  }
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
      status: result.status || 'ready',
      container: updated,
    },
    evidence,
  };
}

module.exports = { backlogMap };
