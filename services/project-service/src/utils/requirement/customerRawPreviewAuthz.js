/**
 * Pure authz for Customer Raw preview (wizard autofill) — no HTTP / env.
 * RULE-01: import persona OR create-project org scope (Wave B).
 */

function canCreateProjectInScope(scope) {
  if (scope && Object.prototype.hasOwnProperty.call(scope, 'canCreateProject')) {
    return Boolean(scope.canCreateProject);
  }
  return Boolean(scope?.canCreateTask);
}

function canPreviewCustomerRawRequirement({ actions, scope } = {}) {
  if (actions?.import) return true;
  return canCreateProjectInScope(scope);
}

module.exports = {
  canPreviewCustomerRawRequirement,
  canCreateProjectInScope,
};
