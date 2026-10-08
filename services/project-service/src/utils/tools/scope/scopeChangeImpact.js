/**
 * B2 — scope_change_impact
 * FR change → tasks → deps → employees → milestones (schedule delta optional)
 */

const {
  makeFact,
  makeWarning,
  makeToolResult,
  hashInput,
} = require('../toolContract');
const { getData, getContext } = require('../normalizeToolInput');

const TOOL_NAME = 'scope_change_impact';
const TOOL_VERSION = 1;

function frHash(fr) {
  return `${fr.id}|${fr.name || ''}|${fr.description || ''}|${fr.ac || ''}`;
}

function runScopeChangeImpact(input = {}, ctx = {}) {
  const beforeFr = Array.isArray(getData(input, 'beforeFr')) ? getData(input, 'beforeFr') : [];
  const afterFr = Array.isArray(getData(input, 'afterFr')) ? getData(input, 'afterFr') : [];
  let changedFrIds = Array.isArray(getData(input, 'changedFrIds'))
    ? getData(input, 'changedFrIds').map(String)
    : [];

  const tasks = Array.isArray(getData(input, 'tasks')) ? getData(input, 'tasks') : [];
  const edges = Array.isArray(getData(input, 'edges')) ? getData(input, 'edges') : [];
  const assignments = Array.isArray(getData(input, 'assignments'))
    ? getData(input, 'assignments')
    : [];
  const milestones = Array.isArray(getData(input, 'milestones'))
    ? getData(input, 'milestones')
    : [];
  const scheduleByTask = getData(input, 'scheduleByTask') || {};
  const warnings = [];

  if (changedFrIds.length === 0 && (beforeFr.length || afterFr.length)) {
    const beforeMap = new Map(beforeFr.map((f) => [f.id, frHash(f)]));
    const afterMap = new Map(afterFr.map((f) => [f.id, frHash(f)]));
    const ids = new Set([...beforeMap.keys(), ...afterMap.keys()]);
    for (const id of ids) {
      if (!beforeMap.has(id) || !afterMap.has(id) || beforeMap.get(id) !== afterMap.get(id)) {
        changedFrIds.push(id);
      }
    }
  }

  const changedSet = new Set(changedFrIds);
  const affectedTasks = new Set();
  for (const t of tasks) {
    const frIds = t.sourceFrIds || t.frIds || [];
    if (frIds.some((id) => changedSet.has(String(id)))) {
      affectedTasks.add(String(t.id));
    }
  }

  // propagate dependency edges (from depends on to)
  let changed = true;
  while (changed) {
    changed = false;
    for (const e of edges) {
      const from = String(e.from || '');
      const to = String(e.to || '');
      if (affectedTasks.has(to) && from && !affectedTasks.has(from)) {
        affectedTasks.add(from);
        changed = true;
      }
      if (affectedTasks.has(from) && to && !affectedTasks.has(to)) {
        // upstream change may affect downstream dependents: from depends on to
        // if to affected, from affected — already covered
      }
    }
  }

  const affectedEmployees = new Set();
  for (const a of assignments) {
    const taskId = String(a.taskId || a.workId || '');
    const empId = String(a.employeeId || a.userId || a.employee || '');
    if (taskId && empId && affectedTasks.has(taskId)) {
      affectedEmployees.add(empId);
    }
  }

  const affectedMilestones = new Set();
  for (const m of milestones) {
    const linked = m.taskIds || m.workIds || [];
    if (linked.some((id) => affectedTasks.has(String(id)))) {
      affectedMilestones.add(String(m.id));
    }
  }

  let scheduleDeltaDays = null;
  let hasSchedule = false;
  let deltaSum = 0;
  for (const tid of affectedTasks) {
    const row = scheduleByTask[tid];
    if (row && row.deltaDays != null && Number.isFinite(Number(row.deltaDays))) {
      hasSchedule = true;
      deltaSum += Number(row.deltaDays);
    }
  }
  if (hasSchedule) {
    scheduleDeltaDays = Math.round(deltaSum * 100) / 100;
  } else if (affectedTasks.size > 0) {
    warnings.push(
      makeWarning({
        code: 'MISSING_SCHEDULE_FACTS',
        severity: 'warn',
        message: 'No scheduleByTask deltas — scheduleDeltaDays unknown',
      })
    );
  }

  const chains = changedFrIds.map((frId) => ({
    frId,
    tasks: [...affectedTasks].filter((tid) => {
      const t = tasks.find((x) => String(x.id) === tid);
      const frIds = t?.sourceFrIds || t?.frIds || [];
      return frIds.map(String).includes(frId);
    }),
  }));

  const data = {
    changedFrIds,
    tasksAffected: affectedTasks.size,
    employeesAffected: affectedEmployees.size,
    milestonesAffected: affectedMilestones.size,
    scheduleDeltaDays,
    taskIds: [...affectedTasks],
    employeeIds: [...affectedEmployees],
    milestoneIds: [...affectedMilestones],
    chains,
    changeRequestId: getContext(input, 'changeRequestId') || null,
  };

  const tool = ctx.tool || TOOL_NAME;
  const version = ctx.version || TOOL_VERSION;
  const inputHash = ctx.inputHash || hashInput(input);

  const facts = [
    makeFact({
      key: 'scopeChange.tasksAffected',
      value: data.tasksAffected,
      unit: 'count',
      tool,
      version,
    }),
    makeFact({
      key: 'scopeChange.employeesAffected',
      value: data.employeesAffected,
      unit: 'count',
      tool,
      version,
    }),
    makeFact({
      key: 'scopeChange.milestonesAffected',
      value: data.milestonesAffected,
      unit: 'count',
      tool,
      version,
    }),
    makeFact({
      key: 'scopeChange.scheduleDeltaDays',
      value: scheduleDeltaDays,
      unit: 'days',
      tool,
      version,
    }),
  ];

  return makeToolResult({
    data,
    facts,
    warnings,
    tool,
    version,
    inputHash,
    evidence: {
      sourceIds: changedFrIds.slice(0, 50),
      formula: 'FR_delta→tasks→deps→assignments→milestones',
      policyVersion: input.policy?.version || 'scope-change-v1',
    },
  });
}

const descriptor = {
  name: TOOL_NAME,
  version: TOOL_VERSION,
  algorithmVersion: 1,
  purpose:
    'Estimate impact of FR/scope change on tasks, employees, milestones, and schedule',
  algorithm: [
    'diff_fr',
    'map_tasks',
    'propagate_deps',
    'map_employees_milestones',
    'schedule_delta',
  ],
  outputKeys: [
    'tasksAffected',
    'employeesAffected',
    'milestonesAffected',
    'scheduleDeltaDays',
    'chains',
  ],
  contextImpact: {
    changeRequestId: { affects: 'evidence', type: 'context' },
  },
  deterministic: true,
  llmCalls: 0,
  invocationMode: 'on_demand',
  dependsOn: [],
  requiredContext: [],
  requiredData: [],
  input: { data: [], context: [], policy: [] },
  aliases: ['B2'],
  run: runScopeChangeImpact,
};

module.exports = { runScopeChangeImpact, descriptor, TOOL_NAME };
