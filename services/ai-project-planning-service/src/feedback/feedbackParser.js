/**
 * G16 Feedback parser — requirement_feedback vs planning_feedback + impact scope.
 *
 * Impact scope whitelist: requirement | WBS | architecture | resource | effort | schedule | risk
 */

const IMPACT_SCOPE_WHITELIST = [
  'requirement',
  'WBS',
  'architecture',
  'resource',
  'effort',
  'schedule',
  'risk',
];

const BAN_EMPLOYEE_RE =
  /\b(ban|exclude|không\s*dùng|khong\s*dung|remove|không\s*assign)\b.*\b(employee|nhân\s*viên|nhan\s*vien)\b|\b(employee|nhân\s*viên)\b.*\b(ban|exclude|không\s*dùng)\b/i;

/**
 * @param {object} raw
 * @returns {{ kind: string, impactScope: string[], bannedEmployeeIds: string[], rawText: string }}
 */
function parseFeedback(raw = {}) {
  const kindRaw = String(raw.kind || raw.type || '').toLowerCase();
  let kind = 'planning_feedback';
  if (kindRaw.includes('requirement') || kindRaw === 'requirement_feedback') {
    kind = 'requirement_feedback';
  } else if (kindRaw.includes('planning') || kindRaw === 'planning_feedback') {
    kind = 'planning_feedback';
  }

  const text = String(raw.text || raw.message || raw.comment || '').trim();
  const explicitScope = Array.isArray(raw.impactScope)
    ? raw.impactScope.filter((s) => IMPACT_SCOPE_WHITELIST.includes(s))
    : [];

  let impactScope = explicitScope.slice();
  const bannedEmployeeIds = [];

  if (kind === 'requirement_feedback') {
    if (!impactScope.length) impactScope = ['requirement'];
  } else {
    // planning_feedback defaults
    if (BAN_EMPLOYEE_RE.test(text) || raw.banEmployee || raw.excludeEmployeeId) {
      const scopes = new Set(impactScope);
      scopes.add('resource');
      scopes.add('schedule');
      // matching → schedule → feasibility; not requirement
      impactScope = Array.from(scopes);
      const id =
        raw.excludeEmployeeId ||
        raw.bannedEmployeeId ||
        raw.employeeId ||
        extractEmployeeIdHint(text);
      if (id) bannedEmployeeIds.push(String(id));
    }
    if (!impactScope.length) {
      impactScope = ['WBS', 'resource', 'effort', 'schedule'];
    }
  }

  return {
    kind,
    impactScope,
    bannedEmployeeIds,
    rawText: text,
    // AC: ban employee must NOT pull requirement understanding
    skipsRequirementUnderstanding: kind === 'planning_feedback' && bannedEmployeeIds.length > 0,
  };
}

function extractEmployeeIdHint(text) {
  const m = String(text).match(/\b(EMP-[\w-]+|[a-f0-9]{24})\b/i);
  return m ? m[1] : null;
}

module.exports = {
  parseFeedback,
  IMPACT_SCOPE_WHITELIST,
};
