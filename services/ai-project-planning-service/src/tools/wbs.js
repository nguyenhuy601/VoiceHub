const { createEvidence } = require('../evidence/evidence');
const { runWbsEngineAsync, applyWbsToContainer } = require('../engines/wbs');

async function wbs(input = {}, context = {}) {
  const snapshotId = input.snapshotId || null;
  const container = context.container || input.container || {};
  const pack = context.pack || input.pack || {};
  const planningHints = input.planningHints || context.planningHints || null;
  const runId = context.runId || input.runId || null;
  const generationId = context.generationId || input.generationId || runId || null;
  const contextPackage =
    input.contextPackage || context.contextPackage || null;

  const backlog = container?.planning?.backlog || null;
  const storyCount = Array.isArray(backlog?.stories) ? backlog.stories.length : 0;
  if (!storyCount) {
    console.warn(
      '[WbsTool] empty planning.backlog.stories — run BacklogMapTool first; fail-closed (no hierarchy)'
    );
  }

  const result = await runWbsEngineAsync(container, {
    pack,
    planningHints,
    generateJsonFn: input.generateJsonFn,
    env: input.env,
    runId,
    generationId,
    contextPackage,
  });
  const updated = applyWbsToContainer(container, result);
  const leafCount =
    result.meta?.leafCount ??
    (Array.isArray(result.tasks)
      ? result.tasks.filter((t) => t.level === 'task').length
      : 0);
  const source = result.meta?.source || 'llm_failed';
  const outcome = result.meta?.decompositionOutcome || 'failure';
  const unresolvedN = Array.isArray(result.meta?.unresolvedStoryIds)
    ? result.meta.unresolvedStoryIds.length
    : 0;
  console.info(
    `[WbsTool] storiesIn=${storyCount} leaves=${leafCount} source=${source} outcome=${outcome} unresolved=${unresolvedN} reason=${result.meta?.fallbackReason || '-'}`
  );

  const evidence = [
    createEvidence({
      sourceType: 'wbs_model',
      sourceId: source,
      snapshotId,
      metric: 'wbs_task_count',
      value: leafCount,
      unit: 'count',
      calculatedBy: 'WbsTool',
      ruleId: 'WBS-ENGINE-001',
    }),
  ];
  if (outcome === 'partial') {
    evidence.push(
      createEvidence({
        sourceType: 'wbs_model',
        sourceId: `partial|unresolved=${unresolvedN}`,
        snapshotId,
        metric: 'wbs_task_count',
        value: leafCount,
        unit: 'count',
        calculatedBy: 'WbsTool',
        ruleId: 'WBS-ENGINE-PARTIAL',
      })
    );
  }
  if (source === 'llm_failed' || source === 'llm_invalid' || outcome === 'failure') {
    const reason = [
      result.meta?.fallbackReason || 'llm_failed',
      ...(result.meta?.reasonCodes || []),
    ]
      .filter(Boolean)
      .join('|')
      .slice(0, 200);
    evidence.push(
      createEvidence({
        sourceType: 'wbs_model',
        sourceId: reason || 'llm_failed',
        snapshotId,
        metric: 'wbs_task_count',
        value: 0,
        unit: 'count',
        calculatedBy: 'WbsTool',
        ruleId: 'WBS-ENGINE-FAIL',
      })
    );
  }

  return { result: { ...result, container: updated }, evidence };
}

module.exports = { wbs };
