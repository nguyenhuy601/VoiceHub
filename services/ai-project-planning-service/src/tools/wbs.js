const { createEvidence } = require('../evidence/evidence');
const {
  runWbsEngineAsync,
  applyWbsToContainer,
  wbsDecompositionError,
  isWbsWaitingExternal,
} = require('../engines/wbs');
const { resolveWbsStoriesFromSot } = require('../engines/wbsStorySot');
const { buildWbsSemanticFromStories } = require('../engines/wbsSemantic');

/**
 * WbsTool — Story SoT (Gate1 approvedBacklogStructure / planning.backlog) + semantic.
 * LLM decomposes Story → Task only. No extractApprovedSrsForWbs / FR-unit invent.
 */
async function wbs(input = {}, context = {}) {
  const snapshotId = input.snapshotId || null;
  const container = context.container || {};
  const pack = context.pack || input.pack || {};
  const toolData = input.toolData || context.toolData || {};

  const sot = resolveWbsStoriesFromSot({
    pack,
    container,
    toolData,
    approvedBacklogStructure: input.approvedBacklogStructure || null,
  });

  const semanticBundle =
    input.semantic && typeof input.semantic === 'object'
      ? { ok: true, semantic: input.semantic }
      : await buildWbsSemanticFromStories({
          stories: sot.stories,
          pack,
          env: input.env,
          contextPackage: input.contextPackage || context.contextPackage || null,
          snapshot: input.snapshot || context.snapshot || null,
          snapshotId,
        });

  const storyCount = sot.stories.length;
  if (!storyCount) {
    console.warn(
      '[WbsTool] missing approved backlog stories — fail-closed (no WBS leaves)'
    );
  }

  const roleAllowList = Array.isArray(toolData.enabledProjectRoleKeys)
    ? toolData.enabledProjectRoleKeys
    : Array.isArray(pack.enabledProjectRoleKeys)
      ? pack.enabledProjectRoleKeys
      : null;

  const result = await runWbsEngineAsync(container, {
    pack,
    toolData,
    approvedBacklogStructure: input.approvedBacklogStructure || null,
    semantic: semanticBundle.semantic || null,
    semanticBundle,
    roleAllowList,
    generateJsonFn: input.generateJsonFn,
    env: input.env,
    runId: context.runId || null,
    generationId: context.generationId || null,
    inputSnapshotId: snapshotId,
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
    : Array.isArray(result.meta?.unresolvedUnitIds)
      ? result.meta.unresolvedUnitIds.length
      : 0;
  console.info(
    `[WbsTool] storiesIn=${storyCount} leaves=${leafCount} source=${source} outcome=${outcome} unresolved=${unresolvedN} reason=${result.meta?.fallbackReason || '-'}`
  );

  // Durable rabbit fan-in: park without treating as decomposition failure.
  if (isWbsWaitingExternal(result)) {
    return {
      result: {
        ...result,
        waitingExternal: true,
        container,
      },
      evidence: [
        createEvidence({
          sourceType: 'wbs_model',
          sourceId: 'waiting_external',
          snapshotId,
          metric: 'wbs_task_count',
          value: 0,
          unit: 'count',
          calculatedBy: 'WbsTool',
          ruleId: 'WBS-ENGINE-WAIT',
        }),
      ],
    };
  }

  const decompositionError = wbsDecompositionError(result);
  if (decompositionError) throw decompositionError;

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
  if (outcome === 'partial' || outcome === 'needs_review') {
    const qualityN = Array.isArray(result.meta?.qualityIssues)
      ? result.meta.qualityIssues.length
      : 0;
    const clarifyN = Array.isArray(result.meta?.clarifications)
      ? result.meta.clarifications.length
      : 0;
    evidence.push(
      createEvidence({
        sourceType: 'wbs_model',
        sourceId: `${outcome}|unresolved=${unresolvedN}|quality=${qualityN}|clarify=${clarifyN}`,
        snapshotId,
        metric: 'wbs_task_count',
        value: leafCount,
        unit: 'count',
        calculatedBy: 'WbsTool',
        ruleId: outcome === 'needs_review' ? 'WBS-ENGINE-REVIEW' : 'WBS-ENGINE-PARTIAL',
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
