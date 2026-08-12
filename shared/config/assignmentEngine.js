/**
 * Feature flag Assignment Engine v1 (Delegation Graph).
 * P0: có thể tắt. P5+: mặc định BẬT khi env không set (rollback: ASSIGNMENT_ENGINE_V1=false).
 */
function envTruthy(name) {
  const v = String(process.env[name] || '').trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

function envFalsy(name) {
  const v = String(process.env[name] || '').trim().toLowerCase();
  return v === 'false' || v === '0' || v === 'no';
}

function isAssignmentEngineEnabled() {
  if (envFalsy('ASSIGNMENT_ENGINE_V1')) return false;
  if (envTruthy('ASSIGNMENT_ENGINE_V1')) return true;
  return true;
}

module.exports = {
  isAssignmentEngineEnabled,
};
