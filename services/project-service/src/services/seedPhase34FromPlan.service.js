/**
 * Seed Phase 3 (TestCase stubs) + Phase 4 (handover checklist skeleton) after Gate 2.
 * Step 9: prefer planning.qualityPlan.catalogPlan with sourceUcKey (RULE-08 / DEC D2).
 * Does NOT set uatStatus=pass or releaseReady confirmed.
 */

const TestCase = require('../models/TestCase');
const Task = require('../models/Task');
const Project = require('../models/Project');
const {
  RELEASE_HANDOVER_CHECKLIST,
} = require('../constants/projectDeliveryPhase');

const MAX_SEED_TESTCASES = Number(process.env.MAX_SEED_TESTCASES || 100);

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

function clip(s, max) {
  return String(s || '').trim().slice(0, max);
}

function resolveAiAnalysis(packOrAnalysis) {
  if (!packOrAnalysis || typeof packOrAnalysis !== 'object') return {};
  if (packOrAnalysis.aiAnalysis && typeof packOrAnalysis.aiAnalysis === 'object') {
    return packOrAnalysis.aiAnalysis;
  }
  if (packOrAnalysis.planning && typeof packOrAnalysis.planning === 'object') {
    return packOrAnalysis;
  }
  return {};
}

/**
 * Pure mapper — catalogPlan entry → TestCase draft fields (no DB).
 * @returns {object|null}
 */
function mapCatalogEntryToTestCaseDraft(entry, { code, organizationId, projectId, createdBy, workItemId } = {}) {
  if (!entry || typeof entry !== 'object') return null;
  const sourceUcKey = clip(entry.sourceUcKey || entry.ucKey || '', 64);
  const tcKey = clip(entry.tcKey || '', 64);
  const title = clip(
    entry.title || (sourceUcKey ? `Verify: ${sourceUcKey}` : tcKey ? `Verify: ${tcKey}` : ''),
    240
  );
  if (!title) return null;
  const externalKey = clip(tcKey || (sourceUcKey ? `uc:${sourceUcKey}` : ''), 64);
  return {
    organizationId,
    projectId,
    code: String(code || '').trim() || 'TC-1',
    title,
    externalKey,
    sourceUcKey,
    status: 'draft',
    workItemId: workItemId || null,
    createdBy: createdBy || null,
    isActive: true,
    meta: {
      seedSource: 'qualityPlan.catalogPlan',
      level: entry.level || null,
      linkedWbsTaskId: entry.linkedWbsTaskId || null,
    },
  };
}

/**
 * Build ordered draft rows from catalogPlan (pure).
 */
function buildSeedRowsFromCatalogPlan(catalogPlan, ctx = {}) {
  const max = Math.max(1, Number(ctx.max) || MAX_SEED_TESTCASES);
  const takenExternal = ctx.takenExternalKeys instanceof Set ? ctx.takenExternalKeys : new Set();
  const workItemByUc =
    ctx.workItemByUcKey instanceof Map ? ctx.workItemByUcKey : new Map();
  let seq = Number(ctx.startSeq) > 0 ? Number(ctx.startSeq) : 1;
  const rows = [];
  for (const entry of asArray(catalogPlan)) {
    if (rows.length >= max) break;
    const draft = mapCatalogEntryToTestCaseDraft(entry, {
      code: `TC-${seq}`,
      organizationId: ctx.organizationId,
      projectId: ctx.projectId,
      createdBy: ctx.createdBy,
      workItemId: null,
    });
    if (!draft) continue;
    if (draft.externalKey && takenExternal.has(draft.externalKey)) continue;
    if (draft.sourceUcKey && workItemByUc.has(draft.sourceUcKey)) {
      draft.workItemId = workItemByUc.get(draft.sourceUcKey);
    } else if (entry?.linkedWbsTaskId && ctx.workItemByTaskKey instanceof Map) {
      const linked = ctx.workItemByTaskKey.get(String(entry.linkedWbsTaskId));
      if (linked) draft.workItemId = linked;
    }
    // Strip meta before persist — keep on object for tests only when keepMeta
    const row = ctx.keepMeta ? draft : { ...draft };
    if (!ctx.keepMeta) delete row.meta;
    rows.push(row);
    if (draft.externalKey) takenExternal.add(draft.externalKey);
    seq += 1;
  }
  return { rows, nextSeq: seq };
}

/**
 * Prefill handoverChecklist keys to false (skeleton for release_handover).
 */
async function ensureHandoverChecklistSkeleton(projectId) {
  const project = await Project.findById(projectId);
  if (!project) {
    return { updated: false, reason: 'project_missing' };
  }
  const current =
    project.handoverChecklist && typeof project.handoverChecklist === 'object'
      ? { ...project.handoverChecklist }
      : {};
  let changed = false;
  for (const item of RELEASE_HANDOVER_CHECKLIST) {
    const id = item.id;
    if (current[id] === undefined) {
      current[id] = false;
      changed = true;
    }
  }
  if (!changed) {
    return { updated: false, checklist: current };
  }
  project.handoverChecklist = current;
  project.markModified('handoverChecklist');
  await project.save();
  return { updated: true, checklist: current };
}

async function nextTestCaseSeq(projectId, organizationId) {
  const last = await TestCase.findOne({ projectId, organizationId })
    .sort({ createdAt: -1 })
    .select('code')
    .lean();
  const m = String(last?.code || '').match(/TC-(\d+)/i);
  return m ? Number(m[1]) + 1 : 1;
}

/**
 * Prefer QualityPlan catalogPlan (sourceUcKey). Idempotent on externalKey / tcKey.
 */
async function seedTestCasesFromCatalogPlan({
  organizationId,
  projectId,
  createdBy = null,
  catalogPlan = [],
  max = MAX_SEED_TESTCASES,
} = {}) {
  const orgId = String(organizationId || '').trim();
  const pid = String(projectId || '').trim();
  const catalog = asArray(catalogPlan);
  if (!orgId || !pid || !catalog.length) {
    return { created: 0, skipped: 0, source: 'catalog', reason: 'empty' };
  }

  const [tasks, existing] = await Promise.all([
    Task.find({
      projectId: pid,
      organizationId: orgId,
      isActive: true,
    })
      .select('_id sourceUcKey externalKey')
      .lean(),
    TestCase.find({
      projectId: pid,
      organizationId: orgId,
      isActive: true,
    })
      .select('externalKey sourceUcKey')
      .lean(),
  ]);

  const takenExternal = new Set(
    existing.map((r) => String(r.externalKey || '').trim()).filter(Boolean)
  );
  const workItemByUcKey = new Map();
  const workItemByTaskKey = new Map();
  for (const t of tasks) {
    const tid = t._id;
    workItemByTaskKey.set(String(tid), tid);
    const uc = clip(t.sourceUcKey || '', 64);
    if (uc && !workItemByUcKey.has(uc)) workItemByUcKey.set(uc, tid);
  }

  const startSeq = await nextTestCaseSeq(pid, orgId);
  const { rows } = buildSeedRowsFromCatalogPlan(catalog, {
    organizationId: orgId,
    projectId: pid,
    createdBy: createdBy || null,
    max,
    startSeq,
    takenExternal,
    workItemByUcKey,
    workItemByTaskKey,
  });

  if (!createdBy) {
    const err = new Error('seedTestCasesFromCatalogPlan yêu cầu createdBy');
    err.statusCode = 400;
    err.errorCode = 'SEED_CREATED_BY_REQUIRED';
    throw err;
  }
  if (rows.length) {
    await TestCase.insertMany(rows, { ordered: false });
  }
  return {
    created: rows.length,
    skipped: Math.max(0, catalog.length - rows.length),
    source: 'catalog',
  };
}

/**
 * Fallback: 1 TC draft per board Task (story|task), with sourceUcKey when task has it.
 */
async function seedTestCaseStubsFromTasks({
  organizationId,
  projectId,
  createdBy = null,
  max = MAX_SEED_TESTCASES,
} = {}) {
  const orgId = String(organizationId || '').trim();
  const pid = String(projectId || '').trim();
  if (!orgId || !pid) {
    return { created: 0, skipped: 0, source: 'tasks' };
  }

  const tasks = await Task.find({
    projectId: pid,
    organizationId: orgId,
    isActive: true,
    issueType: { $in: ['story', 'task'] },
  })
    .select('_id title sourceUcKey')
    .sort({ createdAt: 1 })
    .limit(Math.max(1, Number(max) || MAX_SEED_TESTCASES))
    .lean();

  if (!tasks.length) {
    return { created: 0, skipped: 0, source: 'tasks' };
  }

  const existing = await TestCase.find({
    projectId: pid,
    organizationId: orgId,
    isActive: true,
    workItemId: { $in: tasks.map((t) => t._id) },
  })
    .select('workItemId')
    .lean();
  const have = new Set(existing.map((r) => String(r.workItemId)));

  let seq = await nextTestCaseSeq(pid, orgId);
  const rows = [];
  let skipped = 0;
  for (const task of tasks) {
    if (have.has(String(task._id))) {
      skipped += 1;
      continue;
    }
    if (rows.length >= max) break;
    const sourceUcKey = clip(task.sourceUcKey || '', 64);
    rows.push({
      organizationId: orgId,
      projectId: pid,
      code: `TC-${seq}`,
      title: `Verify: ${String(task.title || 'task').slice(0, 200)}`,
      externalKey: `task:${String(task._id)}`.slice(0, 64),
      sourceUcKey,
      status: 'draft',
      workItemId: task._id,
      createdBy: createdBy || null,
      isActive: true,
    });
    seq += 1;
  }

  if (!createdBy) {
    const err = new Error('seedTestCaseStubsFromTasks yêu cầu createdBy');
    err.statusCode = 400;
    err.errorCode = 'SEED_CREATED_BY_REQUIRED';
    throw err;
  }
  if (rows.length) {
    await TestCase.insertMany(rows, { ordered: false });
  }
  return { created: rows.length, skipped, source: 'tasks' };
}

async function seedPhase34FromPlan({
  organizationId,
  projectId,
  userId = null,
  pack = null,
  aiAnalysis = null,
} = {}) {
  // Hole #4: never silently seed 0 rows when createdBy missing
  if (!userId) {
    const err = new Error(
      'seedPhase34FromPlan yêu cầu userId (createdBy) — không seed TestCase im lặng'
    );
    err.statusCode = 400;
    err.errorCode = 'SEED_CREATED_BY_REQUIRED';
    throw err;
  }

  const container = resolveAiAnalysis(pack || aiAnalysis);
  const catalogPlan = asArray(container?.planning?.qualityPlan?.catalogPlan);

  let testCases;
  if (catalogPlan.length) {
    testCases = await seedTestCasesFromCatalogPlan({
      organizationId,
      projectId,
      createdBy: userId,
      catalogPlan,
    });
    // Gap-fill: tasks still without a TC (e.g. no UC link in catalog)
    const gap = await seedTestCaseStubsFromTasks({
      organizationId,
      projectId,
      createdBy: userId,
    });
    testCases = {
      created: (testCases.created || 0) + (gap.created || 0),
      skipped: (testCases.skipped || 0) + (gap.skipped || 0),
      source: 'catalog+tasks',
      catalog: testCases,
      tasks: gap,
    };
  } else {
    testCases = await seedTestCaseStubsFromTasks({
      organizationId,
      projectId,
      createdBy: userId,
    });
  }

  const handover = await ensureHandoverChecklistSkeleton(projectId);
  return { testCases, handover };
}

module.exports = {
  MAX_SEED_TESTCASES,
  ensureHandoverChecklistSkeleton,
  seedTestCaseStubsFromTasks,
  seedTestCasesFromCatalogPlan,
  seedPhase34FromPlan,
  mapCatalogEntryToTestCaseDraft,
  buildSeedRowsFromCatalogPlan,
  resolveAiAnalysis,
};
