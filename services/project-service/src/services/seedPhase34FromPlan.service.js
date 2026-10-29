/**
 * Seed Phase 3 (TestCase stubs) + Phase 4 (handover checklist skeleton) after Gate 2.
 * Prefer planning.qualityPlan.catalogPlan (RULE-08 / DEC D2).
 * Only seed executable catalog entries; resolve workItem via WBS/FR/UC.
 */

const TestCase = require('../models/TestCase');
const Task = require('../models/Task');
const Project = require('../models/Project');
const {
  RELEASE_HANDOVER_CHECKLIST,
} = require('../constants/projectDeliveryPhase');
const {
  buildFrToUcMap,
  deriveUcFromFrIds,
  textOf,
} = require('../utils/aiAnalysis/fieldMapCanon');

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

/** RULE-Q1 — align with FE qualityRows incomplete detection. */
function isQualityCatalogEntryExecutable(entry) {
  if (!entry || typeof entry !== 'object') return false;
  const title = clip(entry.title || '', 240);
  if (!title) return false;
  if (String(entry.completeness || '').toLowerCase() === 'incomplete') return false;
  if (String(entry.reviewStatus || '').toLowerCase() === 'needs_confirmation') return false;
  const steps = Array.isArray(entry.steps) ? entry.steps : [];
  return steps.some(
    (step) =>
      step &&
      String(step.action || '').trim() &&
      String(step.expectedResult || '').trim()
  );
}

function partitionCatalogPlan(catalogPlan = []) {
  const executable = [];
  const incomplete = [];
  for (const entry of asArray(catalogPlan)) {
    if (isQualityCatalogEntryExecutable(entry)) executable.push(entry);
    else if (entry && typeof entry === 'object' && clip(entry.title || '', 1)) {
      incomplete.push(entry);
    }
  }
  return { executable, incomplete, skippedIncomplete: incomplete.length };
}

/**
 * Pure mapper — catalogPlan entry → TestCase draft fields (no DB).
 */
function mapCatalogEntryToTestCaseDraft(entry, { code, organizationId, projectId, createdBy, workItemId, sourceUcKey } = {}) {
  if (!entry || typeof entry !== 'object') return null;
  const uc = clip(sourceUcKey || entry.sourceUcKey || entry.ucKey || '', 64);
  const tcKey = clip(entry.tcKey || '', 64);
  const title = clip(
    entry.title || (uc ? `Verify: ${uc}` : tcKey ? `Verify: ${tcKey}` : ''),
    240
  );
  if (!title) return null;
  const externalKey = clip(tcKey || (uc ? `uc:${uc}` : ''), 64);
  return {
    organizationId,
    projectId,
    code: String(code || '').trim() || 'TC-1',
    title,
    externalKey,
    sourceUcKey: uc,
    status: 'draft',
    workItemId: workItemId || null,
    createdBy: createdBy || null,
    isActive: true,
    meta: {
      seedSource: 'qualityPlan.catalogPlan',
      level: entry.level || null,
      linkedWbsTaskId: entry.linkedWbsTaskId || null,
      sourceFrIds: Array.isArray(entry.sourceFrIds) ? entry.sourceFrIds.map(String) : [],
    },
  };
}

function resolveWorkItemId(entry, ctx = {}) {
  const blueprintIdMap =
    ctx.blueprintIdMap && typeof ctx.blueprintIdMap === 'object' ? ctx.blueprintIdMap : {};
  const workItemByBlueprint =
    ctx.workItemByBlueprintId instanceof Map ? ctx.workItemByBlueprintId : new Map();
  const workItemByFr =
    ctx.workItemByFrKey instanceof Map ? ctx.workItemByFrKey : new Map();
  const workItemByUc =
    ctx.workItemByUcKey instanceof Map ? ctx.workItemByUcKey : new Map();

  const linkedWbs = clip(entry?.linkedWbsTaskId || '', 120);
  if (linkedWbs) {
    const fromMap = blueprintIdMap[linkedWbs] || workItemByBlueprint.get(linkedWbs);
    if (fromMap) return fromMap;
  }
  const frIds = Array.isArray(entry?.sourceFrIds) ? entry.sourceFrIds : [];
  for (const fr of frIds) {
    const k = clip(fr, 120);
    if (k && workItemByFr.has(k)) return workItemByFr.get(k);
  }
  const uc = clip(entry?.sourceUcKey || entry?.ucKey || '', 64);
  if (uc && workItemByUc.has(uc)) return workItemByUc.get(uc);
  return null;
}

/**
 * Build ordered draft rows from catalogPlan (pure).
 */
function buildSeedRowsFromCatalogPlan(catalogPlan, ctx = {}) {
  const max = Math.max(1, Number(ctx.max) || MAX_SEED_TESTCASES);
  const takenExternal = ctx.takenExternalKeys instanceof Set ? ctx.takenExternalKeys : new Set();
  const frToUcMap = ctx.frToUcMap instanceof Map ? ctx.frToUcMap : new Map();
  let seq = Number(ctx.startSeq) > 0 ? Number(ctx.startSeq) : 1;
  const rows = [];
  let linkedWorkItems = 0;
  for (const entry of asArray(catalogPlan)) {
    if (rows.length >= max) break;
    const frIds = Array.isArray(entry?.sourceFrIds) ? entry.sourceFrIds : [];
    let sourceUcKey = clip(entry?.sourceUcKey || entry?.ucKey || '', 64);
    if (!sourceUcKey) sourceUcKey = deriveUcFromFrIds(frIds, frToUcMap);
    const workItemId = resolveWorkItemId(
      { ...entry, sourceUcKey },
      ctx
    );
    const draft = mapCatalogEntryToTestCaseDraft(
      { ...entry, sourceUcKey },
      {
        code: `TC-${seq}`,
        organizationId: ctx.organizationId,
        projectId: ctx.projectId,
        createdBy: ctx.createdBy,
        workItemId,
        sourceUcKey,
      }
    );
    if (!draft) continue;
    if (draft.externalKey && takenExternal.has(draft.externalKey)) continue;
    if (draft.workItemId) linkedWorkItems += 1;
    const row = ctx.keepMeta ? draft : { ...draft };
    if (!ctx.keepMeta) delete row.meta;
    rows.push(row);
    if (draft.externalKey) takenExternal.add(draft.externalKey);
    seq += 1;
  }
  return { rows, nextSeq: seq, linkedWorkItems };
}

function isDuplicateBulkError(err) {
  if (!err) return false;
  if (Number(err.code) === 11000) return true;
  if (err.name === 'MongoBulkWriteError' || err.name === 'BulkWriteError') return true;
  if (Array.isArray(err.writeErrors) && err.writeErrors.length) {
    return err.writeErrors.every((w) => Number(w.code) === 11000 || Number(w.err?.code) === 11000);
  }
  return false;
}

function countInsertedFromBulkError(err, attempted) {
  const n = Number(attempted) || 0;
  const writeErrors = Array.isArray(err?.writeErrors) ? err.writeErrors.length : 0;
  const inserted = Math.max(0, n - writeErrors);
  return { created: inserted, skippedDup: writeErrors };
}

async function insertTestCasesIdempotent(rows) {
  if (!rows.length) return { created: 0, skippedDup: 0 };
  try {
    await TestCase.insertMany(rows, { ordered: false });
    return { created: rows.length, skippedDup: 0 };
  } catch (err) {
    if (isDuplicateBulkError(err)) {
      return countInsertedFromBulkError(err, rows.length);
    }
    throw err;
  }
}

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

function buildTaskIndexMaps(tasks, blueprintIdMap = {}) {
  const workItemByUcKey = new Map();
  const workItemByFrKey = new Map();
  const workItemByBlueprintId = new Map();
  for (const [bp, mongoId] of Object.entries(blueprintIdMap || {})) {
    if (bp && mongoId) workItemByBlueprintId.set(String(bp), mongoId);
  }
  for (const t of tasks) {
    const tid = t._id;
    const bp = clip(t.blueprintTaskId || '', 120);
    if (bp && !workItemByBlueprintId.has(bp)) workItemByBlueprintId.set(bp, tid);
    const uc = clip(t.sourceUcKey || '', 64);
    if (uc && !workItemByUcKey.has(uc)) workItemByUcKey.set(uc, tid);
    const fr = clip(t.sourceFrKey || '', 120);
    if (fr && !workItemByFrKey.has(fr)) workItemByFrKey.set(fr, tid);
  }
  return { workItemByUcKey, workItemByFrKey, workItemByBlueprintId };
}

async function seedTestCasesFromCatalogPlan({
  organizationId,
  projectId,
  createdBy = null,
  catalogPlan = [],
  max = MAX_SEED_TESTCASES,
  blueprintIdMap = null,
  frToUcMap = null,
  pack = null,
} = {}) {
  const orgId = String(organizationId || '').trim();
  const pid = String(projectId || '').trim();
  const { executable, skippedIncomplete } = partitionCatalogPlan(catalogPlan);
  if (!orgId || !pid) {
    return {
      created: 0,
      skipped: 0,
      skippedIncomplete,
      linkedWorkItems: 0,
      source: 'catalog',
      reason: 'empty_scope',
    };
  }
  if (!executable.length) {
    return {
      created: 0,
      skipped: 0,
      skippedIncomplete,
      linkedWorkItems: 0,
      source: 'catalog',
      reason: 'no_executable',
    };
  }

  const [tasks, existing] = await Promise.all([
    Task.find({
      projectId: pid,
      organizationId: orgId,
      isActive: true,
    })
      .select('_id sourceUcKey sourceFrKey blueprintTaskId issueType')
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
  const maps = buildTaskIndexMaps(tasks, blueprintIdMap || {});
  const resolvedFrToUc =
    frToUcMap instanceof Map
      ? frToUcMap
      : buildFrToUcMap(pack?.useCases || []);

  const startSeq = await nextTestCaseSeq(pid, orgId);
  const { rows, linkedWorkItems } = buildSeedRowsFromCatalogPlan(executable, {
    organizationId: orgId,
    projectId: pid,
    createdBy: createdBy || null,
    max,
    startSeq,
    takenExternal,
    frToUcMap: resolvedFrToUc,
    blueprintIdMap: blueprintIdMap || {},
    ...maps,
  });

  if (!createdBy) {
    const err = new Error('seedTestCasesFromCatalogPlan yêu cầu createdBy');
    err.statusCode = 400;
    err.errorCode = 'SEED_CREATED_BY_REQUIRED';
    throw err;
  }
  const inserted = await insertTestCasesIdempotent(rows);
  return {
    created: inserted.created,
    skipped: inserted.skippedDup + Math.max(0, executable.length - rows.length),
    skippedIncomplete,
    linkedWorkItems,
    source: 'catalog',
  };
}

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
  const inserted = await insertTestCasesIdempotent(rows);
  return {
    created: inserted.created,
    skipped: skipped + inserted.skippedDup,
    source: 'tasks',
  };
}

async function seedPhase34FromPlan({
  organizationId,
  projectId,
  userId = null,
  pack = null,
  aiAnalysis = null,
  blueprintIdMap = null,
} = {}) {
  if (!userId) {
    const err = new Error(
      'seedPhase34FromPlan yêu cầu userId (createdBy) — không seed TestCase im lặng'
    );
    err.statusCode = 400;
    err.errorCode = 'SEED_CREATED_BY_REQUIRED';
    throw err;
  }

  const packObj = pack?.toObject ? pack.toObject() : pack;
  const container = resolveAiAnalysis(packObj || aiAnalysis);
  const catalogPlan = asArray(container?.planning?.qualityPlan?.catalogPlan);
  const frToUcMap = buildFrToUcMap(packObj?.useCases || []);

  let testCases;
  if (catalogPlan.length) {
    const catalog = await seedTestCasesFromCatalogPlan({
      organizationId,
      projectId,
      createdBy: userId,
      catalogPlan,
      blueprintIdMap,
      frToUcMap,
      pack: packObj,
    });
    // Gap stubs for story/task still missing TC (idempotent skip when already linked)
    const gap = await seedTestCaseStubsFromTasks({
      organizationId,
      projectId,
      createdBy: userId,
    });
    testCases = {
      created: (catalog.created || 0) + (gap.created || 0),
      skipped: (catalog.skipped || 0) + (gap.skipped || 0),
      skippedIncomplete: catalog.skippedIncomplete || 0,
      linkedWorkItems: catalog.linkedWorkItems || 0,
      source: 'catalog+tasks',
      catalog,
      tasks: gap,
    };
  } else {
    testCases = await seedTestCaseStubsFromTasks({
      organizationId,
      projectId,
      createdBy: userId,
    });
    testCases.skippedIncomplete = 0;
    testCases.linkedWorkItems = testCases.created || 0;
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
  isQualityCatalogEntryExecutable,
  partitionCatalogPlan,
  resolveWorkItemId,
  isDuplicateBulkError,
  textOf,
};
