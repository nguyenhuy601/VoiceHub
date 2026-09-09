const ASSIGNMENT_SLOTS = Object.freeze([
  'primary',
  'reviewer',
  'approver',
  'collaborator',
  'qa_owner',
  'devops_owner',
  'watcher',
]);

/**
 * Đồng bộ assigneeId (legacy) ↔ assignments[].slot=primary
 */
function syncPrimaryAssignment(assigneeId, assignments) {
  const list = Array.isArray(assignments) ? [...assignments] : [];
  const aid = assigneeId ? String(assigneeId) : '';
  const withoutPrimary = list.filter((a) => String(a.slot || '') !== 'primary');
  if (!aid) {
    return { assigneeId: null, assignments: withoutPrimary };
  }
  return {
    assigneeId: aid,
    assignments: [
      ...withoutPrimary,
      {
        userId: aid,
        slot: 'primary',
        projectRoleId: list.find((a) => String(a.slot) === 'primary')?.projectRoleId || null,
      },
    ],
  };
}

function primaryFromAssignments(assignments) {
  const primary = (assignments || []).find((a) => String(a.slot) === 'primary');
  return primary?.userId || null;
}

function normalizeAssignmentsPayload(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((a) => ({
      userId: a?.userId,
      slot: ASSIGNMENT_SLOTS.includes(String(a?.slot || ''))
        ? String(a.slot)
        : 'collaborator',
      projectRoleId: a?.projectRoleId || null,
    }))
    .filter((a) => a.userId);
}

module.exports = {
  ASSIGNMENT_SLOTS,
  syncPrimaryAssignment,
  primaryFromAssignments,
  normalizeAssignmentsPayload,
};
