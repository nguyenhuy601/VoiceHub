function roleKeyOf(value) {
  return String(value || '').trim().toLowerCase();
}

function peopleForRole(peopleByRole, roleKey) {
  const key = roleKeyOf(roleKey);
  if (!key || !peopleByRole || typeof peopleByRole !== 'object') return [];
  const rows = peopleByRole[key];
  return Array.isArray(rows) ? rows : [];
}

function finiteNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * Match score stays the system score. Effort only marks overload when it
 * exceeds the person's known available hours. Missing hours stay READY.
 */
export function assignmentFitFromPerson(person, effortHours) {
  const score = finiteNumber(person?.score);
  const availableHours = finiteNumber(person?.availableHours ?? person?.available_capacity);
  const effort = finiteNumber(effortHours);
  const overload = availableHours != null && effort != null && effort > 0 && effort > availableHours;
  return {
    score,
    availableHours,
    overload,
    status: overload ? 'OVERLOAD' : 'READY',
  };
}

function clearedPerson(base) {
  return {
    ...base,
    assigneeUserId: '',
    assignee: '',
    score: null,
    availableHours: null,
    overload: false,
    status: 'UNASSIGNED',
  };
}

/**
 * Highest task-fit score among people who can take this effort.
 * Hours unknown does not count as overload. A known shortfall does.
 */
export function pickHighestReadyCandidate(people, effortHours) {
  const effort = finiteNumber(effortHours);
  let best = null;
  let bestScore = -Infinity;
  for (const person of people || []) {
    const userId = String(person?.userId || '').trim();
    if (!userId || person?.feasible === false) continue;
    const available = finiteNumber(person?.availableHours ?? person?.available_capacity);
    if (available != null && effort != null && effort > 0 && effort > available) continue;
    if (available == null && person?.overload === true) continue;
    const score = finiteNumber(person?.score) ?? 0;
    const betterScore = score > bestScore;
    const sameScoreEarlierId =
      score === bestScore && best && userId.localeCompare(String(best.userId)) < 0;
    if (!betterScore && !sameScoreEarlierId) continue;
    best = person;
    bestScore = score;
  }
  return best;
}

/**
 * Fill rows that still have no assignee. Hours already given to a person
 * are subtracted so the same person is not given every open task.
 */
export function fillUnassignedWithReadyPeople(rows, peopleByRole) {
  const list = Array.isArray(rows) ? rows : [];
  const usedHours = new Map();
  for (const row of list) {
    const userId = String(row?.assigneeUserId || '').trim();
    const effort = finiteNumber(row?.effortHours) ?? 0;
    if (!userId || effort <= 0) continue;
    usedHours.set(userId, (usedHours.get(userId) || 0) + effort);
  }
  return list.map((row) => {
    const effort = finiteNumber(row?.effortHours) ?? 0;
    if (String(row?.assigneeUserId || '').trim()) return row;
    const roleKey = roleKeyOf(row?.suggestedRoleKey);
    const people = peopleForRole(peopleByRole, roleKey).map((person) => {
      const available = finiteNumber(person?.availableHours);
      const used = usedHours.get(String(person?.userId || '')) || 0;
      if (available == null) return person;
      return { ...person, availableHours: Math.round((available - used) * 100) / 100 };
    });
    const best = pickHighestReadyCandidate(people, effort);
    if (!best) return row;
    const userId = String(best.userId);
    if (effort > 0) usedHours.set(userId, (usedHours.get(userId) || 0) + effort);
    const label = String(best.displayName || '').trim();
    return {
      ...row,
      assigneeUserId: userId,
      assignee: label && label !== '—' ? label : row.assignee,
      ...assignmentFitFromPerson(best, effort),
    };
  });
}

function withPerson(base, person, effortHours) {
  const label = String(person?.displayName || '').trim();
  return {
    ...base,
    assigneeUserId: String(person.userId),
    assignee: label && label !== '—' ? label : '',
    ...assignmentFitFromPerson(person, effortHours),
  };
}

/**
 * Role and assignee edits must be catalog ids, not free text.
 * Changing role drops the person unless they are already in the new role's pool.
 */
export function patchAssignmentCatalogValue(row, field, prev, value, { peopleByRole } = {}) {
  const base = { ...(prev && typeof prev === 'object' ? prev : {}) };
  if (!Array.isArray(base.taskIds) && Array.isArray(row?.taskIds)) {
    base.taskIds = row.taskIds.map(String);
  }
  if (field === 'suggestedRoleKey') {
    const roleKey = String(value || '').trim();
    const previous = roleKeyOf(base.suggestedRoleKey || row?.suggestedRoleKey);
    const next = roleKeyOf(roleKey);
    if (previous === next) return { ...base, suggestedRoleKey: roleKey };
    const currentId = String(base.assigneeUserId || '').trim();
    const kept = peopleForRole(peopleByRole, next).find(
      (person) => String(person?.userId || '') === currentId
    );
    if (kept && currentId) {
      return withPerson({ ...base, suggestedRoleKey: roleKey }, kept, row?.effortHours);
    }
    return { ...clearedPerson(base), suggestedRoleKey: roleKey };
  }
  if (field === 'assigneeUserId') {
    const wanted = String(value || '').trim();
    if (!wanted) return clearedPerson(base);
    const roleKey = roleKeyOf(base.suggestedRoleKey || row?.suggestedRoleKey);
    const sameRole = roleKey === roleKeyOf(row?.suggestedRoleKey);
    const people = [
      ...peopleForRole(peopleByRole, roleKey),
      ...(sameRole ? row?.candidateOptions || [] : []),
    ];
    const hit = people.find((person) => String(person?.userId || '') === wanted);
    if (!hit) return base;
    return withPerson(base, hit, row?.effortHours);
  }
  return { ...base, [field]: value };
}

/** Options for the assignment selects. Unknown names are omitted. */
export function assignmentSelectOptions({
  row,
  field,
  payload,
  roleOptions = [],
  peopleByRole,
} = {}) {
  if (field === 'suggestedRoleKey') {
    return (Array.isArray(roleOptions) ? roleOptions : [])
      .map((role) => ({
        value: String(role?.value || role?.key || '').trim(),
        label: String(role?.label || role?.value || role?.key || '').trim(),
      }))
      .filter((role) => role.value && role.label);
  }
  if (field !== 'assigneeUserId') return [];
  const roleKey = roleKeyOf(payload?.suggestedRoleKey || row?.suggestedRoleKey);
  const sameRole = roleKey === roleKeyOf(row?.suggestedRoleKey);
  const people = [
    ...peopleForRole(peopleByRole, roleKey),
    ...(sameRole ? row?.candidateOptions || [] : []),
  ];
  const seen = new Set();
  const options = [];
  for (const person of people) {
    const value = String(person?.userId || '').trim();
    const label = String(person?.displayName || '').trim();
    if (!value || !label || label === '—' || seen.has(value)) continue;
    seen.add(value);
    options.push({ value, label });
  }
  return options;
}
