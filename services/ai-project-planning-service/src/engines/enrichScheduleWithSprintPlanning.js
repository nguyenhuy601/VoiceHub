/**
 * Adapter: map Schedule container ↔ Sprint subgraph. No heuristic fallback.
 * Engine may pack leaves into sprint windows for capacity sizing; those
 * assignments are stripped before LLM propose so allocation is LLM-only.
 */

const { EXECUTION_STATUS } = require('../howSecs/sprint/sprintSchema');

function createInputHash(container = {}) {
  const plan = container?.planning?.schedulePlan || {};
  const sprintIds = (plan.sprints || []).map((s) => s.id).join(',');
  const taskCount = (container?.planning?.tasks || []).length;
  const supply = container?.resource?.capacityPlan?.totalSupplyHours ?? '';
  return `sprints:${sprintIds}|tasks:${taskCount}|supply:${supply}`;
}

/**
 * Keep sprint window bounds + capacity; clear engine leaf/PBI dump so
 * Sprint LangGraph (LLM propose → validate) is the sole allocator.
 */
function stripHeuristicSprintAssignments(container = {}) {
  const plan = container?.planning?.schedulePlan;
  if (!plan || !Array.isArray(plan.sprints)) return container;

  let clearedTaskIds = 0;
  let clearedPbiIds = 0;
  const sprints = plan.sprints.map((sprint) => {
    if (!sprint || typeof sprint !== 'object') return sprint;
    const taskIds = Array.isArray(sprint.taskIds) ? sprint.taskIds : [];
    const pbiIds = Array.isArray(sprint.pbiIds) ? sprint.pbiIds : [];
    clearedTaskIds += taskIds.length;
    clearedPbiIds += pbiIds.length;
    return {
      ...sprint,
      taskIds: [],
      pbiIds: [],
      effortHours: 0,
      utilizationPct: null,
      goal: '',
      summary: '',
    };
  });

  const releases = Array.isArray(plan.releases)
    ? plan.releases.map((release) => {
        if (!release || typeof release !== 'object') return release;
        return {
          ...release,
          taskIds: [],
          taskCount: 0,
          effortHours: 0,
        };
      })
    : plan.releases;

  return {
    ...container,
    planning: {
      ...container.planning,
      schedulePlan: {
        ...plan,
        sprints,
        releases,
        meta: {
          ...(plan.meta || {}),
          heuristicLeafDumpCleared: true,
          clearedTaskIdsBeforeLlm: clearedTaskIds,
          clearedPbiIdsBeforeLlm: clearedPbiIds,
        },
      },
    },
  };
}

async function enrichScheduleWithSprintPlanning({
  pack = {},
  container = {},
  env = process.env,
  generateJsonFn = null,
  contextPackage = null,
  snapshot = null,
  snapshotId = null,
  runId = null,
  abortSignal = null,
  checkpointer = null,
} = {}) {
  if (!container?.planning?.schedulePlan) {
    return {
      container,
      meta: {
        sprintEnrichSkipped: 'no_schedule_plan',
        executionStatus: EXECUTION_STATUS.BLOCKED,
        sprintPlanningReady: false,
      },
    };
  }

  let next = stripHeuristicSprintAssignments(container);
  const clearedMeta = next.planning?.schedulePlan?.meta || {};
  console.info(
    '[ScheduleTool] sprint_strip_heuristic',
    `tasks=${clearedMeta.clearedTaskIdsBeforeLlm || 0}`,
    `pbis=${clearedMeta.clearedPbiIdsBeforeLlm || 0}`
  );

  let enrichMeta = {
    inputHash: createInputHash(container),
    runId: runId || null,
    heuristicLeafDumpCleared: true,
    clearedTaskIdsBeforeLlm: clearedMeta.clearedTaskIdsBeforeLlm || 0,
    clearedPbiIdsBeforeLlm: clearedMeta.clearedPbiIdsBeforeLlm || 0,
  };
  let executionStatus = null;
  let sprintErrors = [];

  try {
    const { runSprintSecGraph } = require('../howSecs/sprint/sprintGraph');
    const invokeOpts = {
      pack,
      container: next,
      env,
      generateJsonFn,
      contextPackage,
      snapshot,
      snapshotId,
      runId,
      abortSignal,
    };
    // checkpointer reserved for parent config; Sprint one-shot unless wired later
    void checkpointer;

    const sprintOut = await runSprintSecGraph(invokeOpts);
    executionStatus =
      sprintOut.executionStatus ||
      sprintOut.result?.executionStatus ||
      sprintOut.result?.meta?.executionStatus ||
      EXECUTION_STATUS.INCOMPLETE;
    sprintErrors = sprintOut.errors || sprintOut.result?.meta?.errors || [];

    if (sprintOut?.containerPatch?.planning?.schedulePlan) {
      next = sprintOut.containerPatch;
    }
    enrichMeta = {
      ...enrichMeta,
      ...(next.planning?.schedulePlan?.meta || {}),
      sprintEnrich: 'sprint_sec_graph',
      executionStatus,
      sprintPlanningReady: executionStatus === EXECUTION_STATUS.DRAFT_READY,
      errors: sprintErrors,
    };
    console.info(
      '[ScheduleTool] sprint_enrich',
      `status=${executionStatus}`,
      `ready=${Boolean(enrichMeta.sprintPlanningReady)}`,
      `goalSource=${enrichMeta.goalSource || 'n/a'}`,
      `allocationSource=${enrichMeta.allocationSource || 'n/a'}`,
      `sprints=${next.planning?.schedulePlan?.sprints?.length || 0}`
    );
  } catch (err) {
    console.warn('[ScheduleTool] sprint_how_failed', err?.message || err);
    executionStatus = EXECUTION_STATUS.FAILED;
    sprintErrors = [
      {
        code: 'sprint_graph_throw',
        message: String(err?.message || err).slice(0, 160),
        node: 'enrich',
      },
    ];
    enrichMeta = {
      ...enrichMeta,
      sprintEnrich: 'failed',
      executionStatus,
      sprintPlanningReady: false,
      sprintEnrichError: String(err?.message || err).slice(0, 160),
      errors: sprintErrors,
    };
    // NO heuristic / acceptSprint fallback
  }

  // Release naming only when draft_ready (policy default)
  const allowRelease =
    executionStatus === EXECUTION_STATUS.DRAFT_READY ||
    next?.planning?.schedulePlan?.meta?.executionStatus === EXECUTION_STATUS.DRAFT_READY;

  if (allowRelease) {
    try {
      const { runReleasesSecGraph } = require('../howSecs/releases/releasesGraph');
      const relOut = await runReleasesSecGraph({
        pack,
        container: next,
        env,
        generateJsonFn,
        contextPackage,
        snapshot,
        snapshotId,
      });
      if (relOut?.containerPatch?.planning?.schedulePlan) {
        next = relOut.containerPatch;
      }
      enrichMeta = {
        ...enrichMeta,
        releaseEnrich: next.planning?.schedulePlan?.meta?.releaseNamingSource || 'attempted',
      };
    } catch (err) {
      console.warn('[ScheduleTool] releases_how_failed', err?.message || err);
      enrichMeta = {
        ...enrichMeta,
        releaseEnrich: 'failed',
        releaseEnrichError: String(err?.message || err).slice(0, 160),
      };
    }
  } else {
    enrichMeta = {
      ...enrichMeta,
      releaseEnrich: 'skipped_sprint_not_draft_ready',
    };
  }

  if (next.planning?.schedulePlan) {
    next = {
      ...next,
      planning: {
        ...next.planning,
        schedulePlan: {
          ...next.planning.schedulePlan,
          meta: {
            ...(next.planning.schedulePlan.meta || {}),
            ...enrichMeta,
            executionStatus:
              enrichMeta.executionStatus ||
              next.planning.schedulePlan.meta?.executionStatus ||
              executionStatus,
            sprintPlanningReady: Boolean(enrichMeta.sprintPlanningReady),
          },
        },
      },
    };
  }

  return {
    container: next,
    meta: enrichMeta,
    executionStatus: enrichMeta.executionStatus,
    errors: enrichMeta.errors || [],
  };
}

module.exports = {
  enrichScheduleWithSprintPlanning,
  createInputHash,
  stripHeuristicSprintAssignments,
};
