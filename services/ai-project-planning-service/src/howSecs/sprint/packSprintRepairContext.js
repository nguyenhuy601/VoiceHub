/**
 * Slim repair context for LLM — whitelist only, no full layer dump.
 */

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function clip(value, max = 120) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

/**
 * @param {{ facts: object, allocationProposal: object, allocationValidation: object }} input
 */
function packSprintRepairContext({ facts = {}, allocationProposal = null, allocationValidation = null } = {}) {
  const issues = asArray(allocationValidation?.issues).slice(0, 20).map((issue) => ({
    code: issue.code || null,
    sprintId: issue.sprintId || null,
    pbiId: issue.pbiId || null,
    dependsOn: issue.dependsOn || null,
    roleKey: issue.roleKey || null,
    overByHours: issue.overByHours ?? null,
    message: clip(issue.message, 200),
  }));

  const prevSprints = asArray(allocationProposal?.sprints).map((row) => ({
    id: String(row?.id || '').trim(),
    goal: clip(row?.goal, 120),
    pbiIds: asArray(row?.pbiIds).map(String).slice(0, 40),
  }));

  return {
    VALIDATION_ERRORS: issues,
    PREVIOUS_PROPOSAL: { sprints: prevSprints },
    CONSTRAINTS_HINT: {
      sprintIds: facts.allowLists?.sprintIds || [],
      pbiIds: facts.allowLists?.pbiIds || [],
      capacityEvidence: facts.capacityEvidence || null,
      dependencyEvidence: facts.dependencyEvidence || null,
    },
  };
}

module.exports = { packSprintRepairContext };
