/**
 * Who may read Employee Resource Profile: self vs org-capacity elevated.
 */
function resolveEmployeeProfileAccessMode(actorUserId, targetUserId) {
  const actor = String(actorUserId || '').trim();
  const target = String(targetUserId || '').trim();
  if (!actor || !target) return 'invalid';
  return actor === target ? 'self' : 'elevated';
}

const OID24 = /^[a-fA-F0-9]{24}$/;

/** Unique 24-hex ids — skips undefined/null/"undefined" that CastError Project._id. */
function collectValidProjectIds(values = []) {
  const out = [];
  const seen = new Set();
  for (const raw of values || []) {
    const s = String(raw ?? '').trim();
    if (!OID24.test(s) || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

module.exports = {
  resolveEmployeeProfileAccessMode,
  collectValidProjectIds,
};
