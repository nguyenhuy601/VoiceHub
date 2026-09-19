const { createEvidence } = require('../evidence/evidence');
const {
  runEffortEngine,
  applyEffortToContainer,
} = require('./effort');
const {
  runRoleSkillPlanning,
  applyRoleSkillToContainer,
} = require('./roleSkill');
const { runSequencingCpm, applySequencingCpmToContainer } = require('./sequencingCpm');
const { runEmployeeMatching, applyMatchingToContainer } = require('./employeeMatching');
const { runScheduleCapacity, applyScheduleCapacityToContainer } = require('./scheduleCapacity');

const HOW_JOBS = new Set([
  'effortRoleAnalysis',
  'sequencingCpm',
  'employeeMatching',
  'scheduleCapacity',
]);

function completeJob(container, job, { generatedAt, durationMs, error = null }) {
  return {
    ...container,
    jobs: {
      ...(container?.jobs || {}),
      [job]: {
        ...(container?.jobs?.[job] || {}),
        status: 'ready',
        model: null,
        generatedAt,
        confirmedAt: null,
        durationMs,
        error,
      },
    },
  };
}

async function runHowJob({ job, container, pack = {}, toolData = {}, snapshotId = null }) {
  if (!HOW_JOBS.has(job)) {
    const error = new Error(`Unsupported deterministic HOW job: ${job}`);
    error.code = 'HOW_JOB_UNSUPPORTED';
    throw error;
  }
  if (!container || typeof container !== 'object' || Array.isArray(container)) {
    const error = new Error('Deterministic HOW job requires a container object');
    error.code = 'RUN_INPUT_REQUIRED';
    throw error;
  }
  const startedAt = Date.now();
  let next = structuredClone(container || {});
  let result;
  if (job === 'effortRoleAnalysis') {
    const roleSkill = runRoleSkillPlanning(pack, next);
    next = applyRoleSkillToContainer(next, roleSkill);
    result = runEffortEngine(next);
    next = applyEffortToContainer(next, result);
    result = { ...result, roleSkill };
  } else if (job === 'sequencingCpm') {
    result = runSequencingCpm(next);
    next = applySequencingCpmToContainer(next, result);
  } else if (job === 'employeeMatching') {
    result = await runEmployeeMatching(pack, next, { poolItems: toolData.employees || [] });
    next = applyMatchingToContainer(next, result);
  } else {
    result = runScheduleCapacity(next, {
      projectStart: toolData.overview?.startDate || pack.overview?.startDate || null,
      calendar: toolData.calendar || null,
      meetingHoursByUserDay:
        toolData.meetingHoursByUserDay &&
        typeof toolData.meetingHoursByUserDay === 'object' &&
        !Array.isArray(toolData.meetingHoursByUserDay)
          ? toolData.meetingHoursByUserDay
          : {},
    });
    next = applyScheduleCapacityToContainer(next, result);
  }
  const durationMs = Math.max(0, Date.now() - startedAt);
  next = completeJob(next, job, {
    generatedAt: result.generatedAt,
    durationMs,
    error: result.meta?.error || null,
  });
  const evidence = [
    createEvidence({
      sourceType: 'deterministic_engine',
      sourceId: job,
      snapshotId,
      metric: 'job_status',
      value: 'ready',
      calculatedBy: 'howJobRunner',
      ruleId: `HOW-${job}`,
    }),
  ];
  return {
    job,
    currentJob: job,
    container: next,
    result: { ...result, durationMs },
    meta: {
      generatedAt: result.generatedAt,
      durationMs,
      llmCalls: 0,
    },
    evidence,
  };
}

module.exports = { HOW_JOBS, runHowJob };
