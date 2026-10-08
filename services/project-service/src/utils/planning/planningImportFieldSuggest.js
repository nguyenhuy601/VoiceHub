/**
 * Pure import scan for WBS Due Date and Assignee.
 * Does not fetch, write, or change rankRoleSuggestCandidate / the FE date formula.
 */

const { suggestEndDateFromEffort } = require('./suggestEndDateFromEffort');

function roundHours(value) {
  return Math.round(Number(value) * 100) / 100;
}

function isoDate(raw) {
  const s = String(raw ?? '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

function positiveEffort(structured) {
  const n = Number(structured?.effortHours);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function decisionKey(kind, externalKey, field) {
  return `${String(kind || '').trim().toUpperCase()}|${String(externalKey || '').trim()}|${field}`;
}

function collectParentKeys(rows) {
  const parents = new Set();
  for (const row of rows) {
    if (String(row?.kind || '').toUpperCase() !== 'WBS') continue;
    const parent = String(row.parentExternalKey || '').trim();
    if (parent) parents.add(parent);
  }
  return parents;
}

function collectResourceRoleKeys(rows) {
  const keys = [];
  for (const row of rows) {
    if (String(row?.kind || '').toUpperCase() !== 'RESOURCE') continue;
    const roles = row.structured?.roles;
    if (!Array.isArray(roles)) continue;
    for (const role of roles) {
      const key = String(role?.roleKey || '').trim();
      if (key) keys.push(key);
    }
  }
  return keys;
}

function resolveRoleKey(structured, roleKeys) {
  const known = new Set(
    (Array.isArray(roleKeys) ? roleKeys : [])
      .map((key) => String(key || '').trim().toLowerCase())
      .filter(Boolean)
  );
  const explicit = String(structured?.roleKey || '').trim();
  if (explicit) {
    return known.has(explicit.toLowerCase()) ? explicit : '';
  }
  const skills = Array.isArray(structured?.skillKeys) ? structured.skillKeys : [];
  for (const skill of skills) {
    const token = String(skill || '').trim();
    if (token && known.has(token.toLowerCase())) return token;
  }
  return '';
}

function matchMember(structured, members) {
  const email = String(structured?.assigneeEmail || '').trim().toLowerCase();
  const name = String(structured?.assigneeName || '').trim().toLowerCase();
  const list = Array.isArray(members) ? members : [];
  if (email) {
    const hits = list.filter((member) => String(member?.email || '').trim().toLowerCase() === email);
    if (hits.length === 1) return { status: 'matched', member: hits[0] };
    if (hits.length > 1) return { status: 'ambiguous' };
    return { status: 'unresolved' };
  }
  if (!name) return { status: 'blank' };
  const hits = list.filter((member) => String(member?.displayName || '').trim().toLowerCase() === name);
  if (hits.length === 1) return { status: 'matched', member: hits[0] };
  if (hits.length > 1) return { status: 'ambiguous' };
  return { status: 'unresolved' };
}

function excelAssigneeValue(structured) {
  const email = String(structured?.assigneeEmail || '').trim();
  if (email) return email;
  return String(structured?.assigneeName || '').trim();
}

function baseSuggestion(row, field, excelValue) {
  return {
    kind: 'WBS',
    externalKey: String(row.externalKey || '').trim(),
    sheet: row._sheet || 'WBS',
    row: row._row || 0,
    field,
    excelValue: excelValue || '',
    verdict: '',
    suggestedValue: '',
    basis: '',
    assignee: null,
  };
}

function suggestDueDate(row) {
  const structured = row.structured && typeof row.structured === 'object' ? row.structured : {};
  const excel = String(structured.endDate || '').trim();
  const suggestion = baseSuggestion(row, 'endDate', excel);
  const start = isoDate(structured.startDate);
  const effort = positiveEffort(structured);
  if (!start || effort == null) {
    suggestion.verdict = 'missing_start_or_effort';
    suggestion.basis = 'missing_start_or_effort';
    return suggestion;
  }
  const suggested = suggestEndDateFromEffort(start, effort);
  if (!suggested) {
    suggestion.verdict = 'missing_start_or_effort';
    suggestion.basis = 'missing_start_or_effort';
    return suggestion;
  }
  suggestion.basis = 'weekday_effort_8h';
  suggestion.suggestedValue = suggested;
  if (!excel) {
    suggestion.verdict = 'blank_suggest';
    return suggestion;
  }
  const excelIso = isoDate(excel);
  if (!excelIso || excelIso < start || excelIso < suggested) {
    suggestion.verdict = 'revise';
    return suggestion;
  }
  suggestion.verdict = 'keep';
  return suggestion;
}

function indexCandidates(candidatesByRole) {
  const map = new Map();
  const source = candidatesByRole && typeof candidatesByRole === 'object' ? candidatesByRole : {};
  for (const [key, rows] of Object.entries(source)) {
    map.set(String(key).trim().toLowerCase(), Array.isArray(rows) ? rows : []);
  }
  return map;
}

function initRemaining(candidateMap) {
  const remaining = new Map();
  for (const rows of candidateMap.values()) {
    for (const row of rows) {
      const userId = String(row?.userId || '').trim();
      if (!userId || remaining.has(userId)) continue;
      const hours = Number(row?.availableHours);
      if (!Number.isFinite(hours)) continue;
      remaining.set(userId, hours);
    }
  }
  return remaining;
}

function byEffortDesc(a, b) {
  if (b.effort !== a.effort) return b.effort - a.effort;
  return String(a.row.externalKey || '').localeCompare(String(b.row.externalKey || ''), 'en');
}

function pickCandidate(roleKey, effort, candidateMap, remaining) {
  const ranked = (candidateMap.get(String(roleKey || '').trim().toLowerCase()) || []).slice().sort((a, b) => {
    if ((Number(b?.score) || 0) !== (Number(a?.score) || 0)) {
      return (Number(b?.score) || 0) - (Number(a?.score) || 0);
    }
    return String(a?.displayName || '').localeCompare(String(b?.displayName || ''), 'vi');
  });
  for (const row of ranked) {
    const userId = String(row?.userId || '').trim();
    if (!userId || !remaining.has(userId)) continue;
    if (remaining.get(userId) >= effort) return row;
  }
  return null;
}

function assigneePayload(picked, members, remainingHoursAfter) {
  const userId = String(picked?.userId || '').trim();
  const member = (Array.isArray(members) ? members : []).find((item) => String(item?.userId || '') === userId);
  const email = String(member?.email || picked?.email || '').trim();
  const displayName = String(member?.displayName || picked?.displayName || '').trim();
  const reasonCodes = Array.isArray(picked?.suggestReasons)
    ? picked.suggestReasons.filter(Boolean)
    : Array.isArray(picked?.reasonCodes)
      ? picked.reasonCodes.filter(Boolean)
      : [];
  return {
    userId,
    email,
    displayName,
    reasonCodes,
    remainingHoursAfter,
  };
}

function collectLeafRoleKeys(rows, resourceRoleKeys) {
  const list = Array.isArray(rows) ? rows : [];
  const keys = Array.isArray(resourceRoleKeys) ? resourceRoleKeys : collectResourceRoleKeys(list);
  const parents = collectParentKeys(list);
  const found = new Set();
  for (const row of list) {
    if (String(row?.kind || '').toUpperCase() !== 'WBS') continue;
    const externalKey = String(row.externalKey || '').trim();
    if (!externalKey || parents.has(externalKey)) continue;
    const roleKey = resolveRoleKey(row.structured, keys);
    if (roleKey) found.add(roleKey.toLowerCase());
  }
  return [...found];
}

function leafRows(rows, skipKeys) {
  const parents = collectParentKeys(rows);
  return rows.filter((row) => {
    if (String(row?.kind || '').toUpperCase() !== 'WBS') return false;
    const key = String(row.externalKey || '').trim();
    if (!key || parents.has(key)) return false;
    if (skipKeys.has(`WBS:${key}`) || skipKeys.has(key)) return false;
    return true;
  });
}

function suggestPlanningImportFields(rows, options = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const members = Array.isArray(options.members) ? options.members : [];
  const roleKeys = Array.isArray(options.resourceRoleKeys)
    ? options.resourceRoleKeys
    : collectResourceRoleKeys(list);
  const skipKeys = options.skipKeys instanceof Set ? options.skipKeys : new Set();
  const replaceKeys = options.replaceAssigneeKeys instanceof Set ? options.replaceAssigneeKeys : new Set();
  const hasProjectWindow = options.hasProjectWindow !== false;
  const poolUnavailable = Boolean(options.poolUnavailable);
  const leaves = leafRows(list, skipKeys);
  const suggestions = leaves.map((row) => suggestDueDate(row));
  const candidateMap = indexCandidates(options.candidatesByRole);
  const remaining = initRemaining(candidateMap);

  const items = leaves.map((row) => {
    const structured = row.structured && typeof row.structured === 'object' ? row.structured : {};
    return {
      row,
      structured,
      effort: positiveEffort(structured),
      roleKey: resolveRoleKey(structured, roleKeys),
      match: matchMember(structured, members),
    };
  });

  if (!hasProjectWindow || poolUnavailable) {
    const basis = poolUnavailable ? 'pool_unavailable' : 'no_project_window';
    for (const item of items) {
      suggestions.push(assigneeWithoutHourCheck(item, basis));
    }
    return suggestions;
  }

  const occupied = items
    .filter(
      (item) =>
        item.match.status === 'matched' &&
        item.effort != null &&
        !replaceKeys.has(String(item.row.externalKey || '').trim())
    )
    .sort(byEffortDesc);

  const reservedVerdict = new Map();
  for (const item of occupied) {
    const userId = String(item.match.member.userId || '').trim();
    const enough = Boolean(userId) && remaining.has(userId) && remaining.get(userId) >= item.effort;
    if (userId && remaining.has(userId)) {
      remaining.set(userId, roundHours(remaining.get(userId) - item.effort));
    }
    reservedVerdict.set(String(item.row.externalKey || '').trim(), enough ? 'keep' : 'revise');
  }

  const needsPick = items
    .filter((item) => {
      const key = String(item.row.externalKey || '').trim();
      if (!item.roleKey || item.effort == null) return false;
      if (replaceKeys.has(key)) return true;
      if (reservedVerdict.get(key) === 'keep') return false;
      if (reservedVerdict.get(key) === 'revise') return true;
      return item.match.status !== 'matched';
    })
    .sort(byEffortDesc);

  const picks = new Map();
  for (const item of needsPick) {
    const picked = pickCandidate(item.roleKey, item.effort, candidateMap, remaining);
    if (!picked) continue;
    const userId = String(picked.userId || '').trim();
    const next = roundHours(remaining.get(userId) - item.effort);
    remaining.set(userId, next);
    picks.set(String(item.row.externalKey || '').trim(), { picked, remainingHoursAfter: next });
  }

  for (const item of items) {
    suggestions.push(buildAssigneeSuggestion(item, reservedVerdict, picks, members));
  }
  return suggestions;
}

function assigneeWithoutHourCheck(item, basis) {
  const suggestion = baseSuggestion(item.row, 'assignee', excelAssigneeValue(item.structured));
  suggestion.basis = basis;
  if (!item.roleKey && item.match.status === 'blank') {
    suggestion.verdict = 'missing_role';
    suggestion.basis = 'missing_role';
    return suggestion;
  }
  if (item.match.status === 'matched') {
    suggestion.verdict = 'keep';
    return suggestion;
  }
  suggestion.verdict = item.match.status === 'blank' && !item.roleKey ? 'missing_role' : 'revise';
  if (!item.roleKey) suggestion.basis = 'missing_role';
  return suggestion;
}

function buildAssigneeSuggestion(item, reservedVerdict, picks, members) {
  const key = String(item.row.externalKey || '').trim();
  const suggestion = baseSuggestion(item.row, 'assignee', excelAssigneeValue(item.structured));
  suggestion.basis = 'rule_b_remaining_hours';
  if (!item.roleKey) {
    suggestion.verdict = 'missing_role';
    suggestion.basis = 'missing_role';
    return suggestion;
  }
  if (item.effort == null) {
    suggestion.verdict = item.match.status === 'matched' ? 'keep' : 'missing_start_or_effort';
    suggestion.basis = 'missing_start_or_effort';
    return suggestion;
  }
  if (reservedVerdict.get(key) === 'keep') {
    suggestion.verdict = 'keep';
    return suggestion;
  }
  const pick = picks.get(key);
  if (!pick) {
    suggestion.verdict = 'revise';
    return suggestion;
  }
  const payload = assigneePayload(pick.picked, members, pick.remainingHoursAfter);
  suggestion.assignee = payload;
  suggestion.suggestedValue = payload.email;
  suggestion.verdict = item.match.status === 'blank' ? 'blank_suggest' : 'revise';
  return suggestion;
}

function suggestionsForConfirm(rows, options, decisions) {
  const first = suggestPlanningImportFields(rows, options);
  const replaceAssigneeKeys = new Set();
  for (const decision of Array.isArray(decisions) ? decisions : []) {
    if (decision?.apply !== true || decision.field !== 'assignee') continue;
    const match = first.find(
      (item) =>
        item.field === 'assignee' &&
        item.externalKey === String(decision.externalKey || '').trim() &&
        String(item.kind || '').toUpperCase() === String(decision.kind || 'WBS').toUpperCase()
    );
    if (match && match.verdict === 'revise') {
      replaceAssigneeKeys.add(String(decision.externalKey || '').trim());
    }
  }
  if (!replaceAssigneeKeys.size) return first;
  return suggestPlanningImportFields(rows, { ...options, replaceAssigneeKeys });
}

function applyDecisionsToRows(rows, suggestions, decisions) {
  if (!Array.isArray(decisions) || decisions.length === 0) return { applied: 0 };
  const byKey = new Map(
    (Array.isArray(suggestions) ? suggestions : []).map((item) => [
      decisionKey(item.kind, item.externalKey, item.field),
      item,
    ])
  );
  let applied = 0;
  for (const decision of decisions) {
    if (decision?.apply !== true) continue;
    if (decision.field !== 'endDate' && decision.field !== 'assignee') continue;
    const suggestion = byKey.get(decisionKey(decision.kind, decision.externalKey, decision.field));
    if (!suggestion || suggestion.verdict === 'keep') continue;
    if (suggestion.verdict !== 'blank_suggest' && suggestion.verdict !== 'revise') continue;
    const row = (Array.isArray(rows) ? rows : []).find(
      (item) =>
        String(item?.kind || '').toUpperCase() === String(suggestion.kind || '').toUpperCase() &&
        String(item?.externalKey || '').trim() === suggestion.externalKey
    );
    if (!row) continue;
    if (!row.structured || typeof row.structured !== 'object') row.structured = {};
    if (decision.field === 'endDate') {
      if (!suggestion.suggestedValue) continue;
      row.structured.endDate = suggestion.suggestedValue;
      applied += 1;
      continue;
    }
    const person = suggestion.assignee;
    if (!person?.userId || !person?.email) continue;
    if (Number(person.remainingHoursAfter) < 0) continue;
    row.structured.assigneeEmail = person.email;
    row.structured.assigneeName = person.displayName || '';
    row.structured.assigneeUserId = person.userId;
    applied += 1;
  }
  return { applied };
}

module.exports = {
  suggestPlanningImportFields,
  suggestionsForConfirm,
  applyDecisionsToRows,
  collectResourceRoleKeys,
  collectLeafRoleKeys,
  resolveRoleKey,
};
