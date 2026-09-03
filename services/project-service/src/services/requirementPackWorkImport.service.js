/**
 * Import RequirementPack FR tree → PlanningItems + board Tasks on create-from-pack.
 */

const { logger } = require('@enterprise/shared');
const { setUserProjectRoles } = require('./projectTeam.service');
const { isFrExecutionLeaf } = require('../utils/requirementFrLevel');
const { buildLeafAssigneeMap } = require('../utils/requirementPackWorkImport.utils');
const { importRequirementPackWorkItemsFast } = require('../utils/requirementPackWorkImport.fast');

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
  return importRequirementPackWorkItemsFast(input);
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
  const overlayLeaves = pack?.aiPlanning?.overlay?.leafAssignments || [];
  const assigneeMap = buildLeafAssigneeMap(leafAssignments, overlayLeaves);
  const frList = pack?.functionalRequirements || [];
  const roleByUser = new Map();

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
  seedProjectMembersFromAssignees,
};
