/**
 * Import RequirementPack FR tree → PlanningItems + board Tasks on create-from-pack.
 */

const { logger } = require('@enterprise/shared');
const { setUserProjectRoles } = require('./projectTeam.service');
const { isFrExecutionLeaf } = require('../utils/requirementFrLevel');
const { buildLeafAssigneeMap } = require('../utils/requirementPackWorkImport.utils');
const { importRequirementPackWorkItemsFast, importBlueprintWorkItemsFast } = require('../utils/requirementPackWorkImport.fast');
const {
  assertBlueprintReadyForProjectCreate,
  mapBlueprintTasksToImportPlan,
} = require('../utils/aiAnalysisBlueprintImport');
const { getJobStatus, ensureAiAnalysisContainer } = require('../utils/aiAnalysisContainer');

const IMPORT_HOURS_RATIONALE = 'requirement_pack_import';

/**
 * @param {{
 *   userId: string,
 *   organizationId: string,
 *   pack: object,
 *   project: object,
 *   boardId: string,
 *   listId?: string,
 *   leafAssignments?: Array<{ externalId: string, userId?: string|null }>,
 * }} input
 */
async function importRequirementPackWorkItems(input) {
  const pack = input?.pack;
  const container = ensureAiAnalysisContainer(pack?.aiAnalysis);
  const job6 = getJobStatus(container, 'employeeAssignment');
  if (job6 === 'confirmed' && (container.planning?.tasks || []).length) {
    const blueprintPlan = mapBlueprintTasksToImportPlan(container, {
      applyAssignees: input.applyAssignees !== false,
      taskIds: input.taskIds || null,
    });
    return importBlueprintWorkItemsFast({
      ...input,
      blueprintPlan,
    });
  }
  // Legacy FR→Task only when Blueprint Job6 not confirmed (W10 prefers Blueprint-only)
  return importRequirementPackWorkItemsFast(input);
}

/**
 * W9 — require Job6 confirmed then import blueprint tasks.
 */
async function importBlueprintFromPack(input) {
  assertBlueprintReadyForProjectCreate(input.pack);
  const container = ensureAiAnalysisContainer(input.pack.aiAnalysis);
  const blueprintPlan = mapBlueprintTasksToImportPlan(container, {
    applyAssignees: input.applyAssignees !== false,
    taskIds: input.taskIds || null,
  });
  return importBlueprintWorkItemsFast({
    ...input,
    blueprintPlan,
  });
}

/**
 * Best-effort: add assignees as project members with suggested role keys.
 */
async function seedProjectMembersFromAssignees({
  userId,
  projectId,
  boardId,
  pack,
  leafAssignments = [],
}) {
  const container = ensureAiAnalysisContainer(pack?.aiAnalysis);
  const job6 = getJobStatus(container, 'employeeAssignment');
  const roleByUser = new Map();

  if (job6 === 'confirmed' && (container.resource?.assignments || []).length) {
    const roleByTask = new Map(
      (container.planning?.tasks || []).map((t) => [
        String(t.id),
        String(t.suggestedRoleKey || '')
          .trim()
          .toLowerCase() || 'developer',
      ])
    );
    for (const a of container.resource.assignments) {
      const uid = String(a?.userId || '').trim();
      if (!uid) continue;
      const roleKey = roleByTask.get(String(a.taskId)) || 'developer';
      if (!roleByUser.has(uid)) roleByUser.set(uid, new Set());
      roleByUser.get(uid).add(roleKey);
    }
  } else if (Array.isArray(leafAssignments) && leafAssignments.length) {
    // Request-body leaf overrides only — no legacy aiPlanning.overlay
    const assigneeMap = buildLeafAssigneeMap(leafAssignments, []);
    const frList = pack?.functionalRequirements || [];

    for (const row of frList) {
      const ext = String(row.externalId || '').trim();
      if (!ext || !isFrExecutionLeaf(row, frList)) continue;
      const uid = assigneeMap.get(ext);
      if (!uid) continue;
      const roleKey =
        String(row.suggestedRoleKey || '')
          .trim()
          .toLowerCase() || 'developer';
      if (!roleByUser.has(uid)) roleByUser.set(uid, new Set());
      roleByUser.get(uid).add(roleKey);
    }
  }

  let added = 0;
  for (const [uid, roles] of roleByUser.entries()) {
    try {
      await setUserProjectRoles({
        projectId,
        boardId,
        userId: uid,
        projectRoleKeys: [...roles],
        addedBy: userId,
        boardRole: 'editor',
      });
      added += 1;
    } catch (err) {
      logger.warn('[requirement] seed member user=%s failed: %s', uid, err.message);
    }
  }
  return { membersSeeded: added };
}

module.exports = {
  IMPORT_HOURS_RATIONALE,
  importRequirementPackWorkItems,
  importBlueprintFromPack,
  seedProjectMembersFromAssignees,
};
