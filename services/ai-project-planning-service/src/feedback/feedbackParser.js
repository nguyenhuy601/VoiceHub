/**
 * G16 Feedback parser — requirement_feedback vs planning_feedback + impact scope.
 * Gate2 reject default: resource + schedule (Loop2 Who×When).
 * Structure keywords → WBS/structure scope.
 */

const IMPACT_SCOPE_WHITELIST = [
  'requirement',
  'WBS',
  'wbs',
  'structure',
  'architecture',
  'resource',
  'effort',
  'schedule',
  'risk',
];

const BAN_EMPLOYEE_RE =
  /\b(ban|exclude|không\s*dùng|khong\s*dung|remove|không\s*assign)\b.*\b(employee|nhân\s*viên|nhan\s*vien)\b|\b(employee|nhân\s*viên)\b.*\b(ban|exclude|không\s*dùng)\b/i;

const STRUCTURE_RE =
  /\b(wbs|cấu\s*trúc|cau\s*truc|phân\s*rã|phan\s*ra|hierarchy|epic|feature|story|decompose|structure)\b/i;

/**
 * @param {object} raw
 * @returns {{ kind: string, source: string, impactScope: string[], bannedEmployeeIds: string[], rawText: string }}
 */
function parseFeedback(raw = {}) {
  const kindRaw = String(raw.kind || raw.type || '').toLowerCase();
  let kind = 'planning_feedback';
  if (kindRaw.includes('requirement') || kindRaw === 'requirement_feedback') {
    kind = 'requirement_feedback';
  } else if (kindRaw.includes('planning') || kindRaw === 'planning_feedback') {
    kind = 'planning_feedback';
  }

  const text = String(raw.text || raw.message || raw.comment || raw.note || '').trim();
  const explicitScope = Array.isArray(raw.impactScope)
    ? raw.impactScope.filter((s) => IMPACT_SCOPE_WHITELIST.includes(s))
    : [];

  let impactScope = explicitScope.slice();
  const bannedEmployeeIds = [];

  if (kind === 'requirement_feedback') {
    if (!impactScope.length) impactScope = ['requirement'];
  } else {
    if (BAN_EMPLOYEE_RE.test(text) || raw.banEmployee || raw.excludeEmployeeId) {
      const scopes = new Set(impactScope);
      scopes.add('resource');
      scopes.add('schedule');
      impactScope = Array.from(scopes);
      const id =
        raw.excludeEmployeeId ||
        raw.bannedEmployeeId ||
        raw.employeeId ||
        extractEmployeeIdHint(text);
      if (id) bannedEmployeeIds.push(String(id));
    }
    if (STRUCTURE_RE.test(text)) {
      const scopes = new Set(impactScope);
      scopes.add('structure');
      scopes.add('WBS');
      impactScope = Array.from(scopes);
    }
    // Gate2 Loop2 default: rematch + reschedule; keep any structure scopes already added
    if (!impactScope.length) {
      impactScope = ['resource', 'schedule'];
    } else if (
      !impactScope.includes('resource') &&
      !impactScope.includes('schedule') &&
      (impactScope.includes('structure') ||
        impactScope.includes('WBS') ||
        impactScope.includes('wbs'))
    ) {
      impactScope = [...impactScope, 'resource', 'schedule'];
    }
  }

  const sourceRaw = String(raw.source || '').trim().toLowerCase();
  let source = sourceRaw === 'gate1' || sourceRaw === 'gate2' ? sourceRaw : null;
  if (!source) {
    source = kind === 'requirement_feedback' ? 'gate1' : 'gate2';
  }

  return {
    kind,
    source,
    impactScope,
    bannedEmployeeIds,
    rawText: text,
    skipsRequirementUnderstanding: kind === 'planning_feedback' && bannedEmployeeIds.length > 0,
  };
}

function extractEmployeeIdHint(text) {
  const m = String(text || '').match(/\b(user|emp|e)[:\s-]?([a-f0-9]{8,24})\b/i);
  return m ? m[2] : null;
}

module.exports = {
  IMPACT_SCOPE_WHITELIST,
  parseFeedback,
  extractEmployeeIdHint,
};
