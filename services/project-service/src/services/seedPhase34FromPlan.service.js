/**
 * Seed Phase 3 (TestCase stubs) + Phase 4 (handover checklist skeleton) after Gate 2.
 * Does NOT set uatStatus=pass or releaseReady confirmed.
 */

const TestCase = require('../models/TestCase');
const Task = require('../models/Task');
const Project = require('../models/Project');
const {
  RELEASE_HANDOVER_CHECKLIST,
} = require('../constants/projectDeliveryPhase');

const MAX_SEED_TESTCASES = Number(process.env.MAX_SEED_TESTCASES || 100);

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

/**
 * 1 TC draft per board Task (story|task), capped.
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
    return { created: 0, skipped: 0 };
  }

  const tasks = await Task.find({
    projectId: pid,
    organizationId: orgId,
    isActive: true,
    issueType: { $in: ['story', 'task'] },
  })
    .select('_id title')
    .sort({ createdAt: 1 })
    .limit(Math.max(1, Number(max) || MAX_SEED_TESTCASES))
    .lean();

  if (!tasks.length) {
    return { created: 0, skipped: 0 };
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

  const last = await TestCase.findOne({ projectId: pid, organizationId: orgId })
    .sort({ createdAt: -1 })
    .select('code')
    .lean();
  let seq = 1;
  const m = String(last?.code || '').match(/TC-(\d+)/i);
  if (m) seq = Number(m[1]) + 1;

  const rows = [];
  let skipped = 0;
  for (const task of tasks) {
    if (have.has(String(task._id))) {
      skipped += 1;
      continue;
    }
    if (rows.length >= max) break;
    rows.push({
      organizationId: orgId,
      projectId: pid,
      code: `TC-${seq}`,
      title: `Verify: ${String(task.title || 'task').slice(0, 200)}`,
      externalKey: `task:${String(task._id)}`,
      status: 'draft',
      workItemId: task._id,
      createdBy: createdBy || null,
      isActive: true,
    });
    seq += 1;
  }

  if (rows.length) {
    await TestCase.insertMany(rows, { ordered: false });
  }
  return { created: rows.length, skipped };
}

async function seedPhase34FromPlan({
  organizationId,
  projectId,
  userId = null,
} = {}) {
  const tc = await seedTestCaseStubsFromTasks({
    organizationId,
    projectId,
    createdBy: userId,
  });
  const handover = await ensureHandoverChecklistSkeleton(projectId);
  return { testCases: tc, handover };
}

module.exports = {
  MAX_SEED_TESTCASES,
  ensureHandoverChecklistSkeleton,
  seedTestCaseStubsFromTasks,
  seedPhase34FromPlan,
};
