/**
 * Pure staffing pipeline helpers — Effort 2a/2b/2c, manday, delta WBS↔RESOURCE.
 * No I/O.
 */

export const STAFFING_STEPS = Object.freeze([
  'wbs',
  'effort',
  'match',
  'capacity',
  'schedule',
]);

export const HOURS_PER_MANDAY = 8;

export function hoursToManday(effortHours) {
  if (effortHours == null || effortHours === '') return null;
  const h = Number(effortHours);
  if (!Number.isFinite(h) || h < 0) return null;
  return Math.round((h / HOURS_PER_MANDAY) * 100) / 100;
}

export function mandayToHours(manday) {
  const d = Number(manday);
  if (!Number.isFinite(d) || d < 0) return null;
  return Math.round(d * HOURS_PER_MANDAY * 100) / 100;
}

/**
 * @param {object} artifact PlanningArtifact-like
 */
export function getStructured(artifact) {
  const s = artifact?.structured;
  return s && typeof s === 'object' && !Array.isArray(s) ? s : {};
}

export function assigneeLabel(structured, nameByUserId = {}) {
  const named = String(structured?.assigneeName || '').trim();
  if (named) return named;
  const id = String(structured?.assigneeUserId || '').trim();
  if (!id) return '';
  return String(nameByUserId?.[id] || '').trim();
}

export function collectResourceRoles(resourceArtifacts = []) {
  const out = [];
  for (const artifact of Array.isArray(resourceArtifacts) ? resourceArtifacts : []) {
    const roles = getStructured(artifact).roles;
    if (Array.isArray(roles)) out.push(...roles);
  }
  return out;
}

/** Person line on staffing cards. Role words stored in assigneeName are not a person's name. */
export function staffingPersonLabel(structured, nameByUserId = {}, resourceRoles = []) {
  const st = structured && typeof structured === 'object' ? structured : {};
  const inferred = inferLeafRoleKey(st, resourceRoles);
  const memberName = st.assigneeUserId
    ? String(nameByUserId[String(st.assigneeUserId)] || '').trim()
    : '';
  if (inferred.fromAssigneeName) return memberName;
  if (memberName) return memberName;
  return assigneeLabel(st, nameByUserId);
}

/**
 * Employee profile payload keeps free capacity under capacity.availablePct
 * and allocations under capacity.projectAllocations.
 */
export function readAssigneeCapacity(profile) {
  const capacity =
    profile?.capacity && typeof profile.capacity === 'object' ? profile.capacity : {};
  const rawPct = profile?.availablePct != null ? profile.availablePct : capacity.availablePct;
  const availablePct =
    rawPct != null && rawPct !== '' && Number.isFinite(Number(rawPct)) ? Number(rawPct) : null;
  const allocations = Array.isArray(capacity.projectAllocations) ? capacity.projectAllocations : [];
  const leaveDate =
    allocations
      .map((row) => (row?.leaveDate ? String(row.leaveDate).slice(0, 10) : ''))
      .filter(Boolean)
      .sort()[0] || null;
  return { availablePct, allocations, leaveDate };
}

/**
 * Workbook stores Role Key on RESOURCE_ROLES, and often puts that same word
 * in the WBS Assignee Name cell while Assignee Email is already a member.
 * @returns {{ roleKey: string, fromAssigneeName: boolean }}
 */
export function inferLeafRoleKey(structured, resourceRoles = []) {
  const explicit = String(structured?.roleKey || '').trim();
  if (explicit) return { roleKey: explicit, fromAssigneeName: false };
  const name = String(structured?.assigneeName || '').trim().toLowerCase();
  if (!name) return { roleKey: '', fromAssigneeName: false };
  for (const role of Array.isArray(resourceRoles) ? resourceRoles : []) {
    const key = String(role?.roleKey || '').trim();
    const title = String(role?.title || '').trim();
    if (key.toLowerCase() === name || title.toLowerCase() === name) {
      return { roleKey: key || title, fromAssigneeName: true };
    }
  }
  return { roleKey: '', fromAssigneeName: false };
}

export function isWbsLeaf(artifact, allWbs = []) {
  const key = String(artifact?.externalKey || '').trim();
  if (!key) return true;
  const usedAsParent = new Set(
    (Array.isArray(allWbs) ? allWbs : [])
      .map((w) => String(w.parentExternalKey || '').trim())
      .filter(Boolean)
  );
  return !usedAsParent.has(key);
}

export function sumWbsLeafEffortHours(wbsArtifacts = []) {
  const list = Array.isArray(wbsArtifacts) ? wbsArtifacts : [];
  let sum = 0;
  let counted = 0;
  for (const a of list) {
    if (!isWbsLeaf(a, list)) continue;
    const h = Number(getStructured(a).effortHours);
    if (Number.isFinite(h) && h >= 0) {
      sum += h;
      counted += 1;
    }
  }
  return { sum: Math.round(sum * 100) / 100, leafWithEffort: counted, leafTotal: list.filter((a) => isWbsLeaf(a, list)).length };
}

export function sumResourceRolesEffortHours(resourceArtifacts = []) {
  const list = Array.isArray(resourceArtifacts) ? resourceArtifacts : [];
  let sum = 0;
  for (const a of list) {
    const roles = getStructured(a).roles;
    if (!Array.isArray(roles)) continue;
    for (const r of roles) {
      const h = Number(r?.effortHours);
      const count = Math.max(1, Number(r?.count) || 1);
      if (Number.isFinite(h) && h >= 0) sum += h * count;
    }
  }
  return Math.round(sum * 100) / 100;
}

/**
 * Soft readiness for Effort step (2a/2b/2c) on one leaf.
 */
export function assessEffortReadiness(artifact) {
  const st = getStructured(artifact);
  const title = String(artifact?.title || '').trim();
  const notes = String(st.notes || artifact?.summary || artifact?.body || '').trim();
  const hasDescription = Boolean(title);
  const skillKeys = Array.isArray(st.skillKeys) ? st.skillKeys.filter(Boolean) : [];
  const roleKey = String(st.roleKey || '').trim();
  const hasRoleOrSkill = Boolean(roleKey) || skillKeys.length > 0;
  const effortHours = Number(st.effortHours);
  const hasEffort = Number.isFinite(effortHours) && effortHours >= 0;
  return {
    hasDescription,
    hasRoleOrSkill,
    hasEffort,
    effortHours: hasEffort ? effortHours : null,
    manday: hasEffort ? hoursToManday(effortHours) : null,
    roleKey: roleKey || '',
    skillKeys,
    readyForMatch: hasDescription && hasEffort,
  };
}

/**
 * @returns {{ deltaHours: number|null, warn: boolean, wbsSum: number, resourceSum: number }}
 */
export function effortDelta(wbsArtifacts, resourceArtifacts, { warnPct = 0.25 } = {}) {
  const { sum: wbsSum } = sumWbsLeafEffortHours(wbsArtifacts);
  const resourceSum = sumResourceRolesEffortHours(resourceArtifacts);
  if (wbsSum <= 0 && resourceSum <= 0) {
    return { deltaHours: null, warn: false, wbsSum, resourceSum };
  }
  const deltaHours = Math.round((wbsSum - resourceSum) * 100) / 100;
  const base = Math.max(wbsSum, resourceSum, 1);
  const warn = Math.abs(deltaHours) / base >= warnPct;
  return { deltaHours, warn, wbsSum, resourceSum };
}

/**
 * Suggest end date from start + effortHours (weekdays only, simple).
 * @param {string} startIso YYYY-MM-DD
 * @param {number} effortHours
 */
export function suggestEndDateFromEffort(startIso, effortHours) {
  const start = String(startIso || '').trim().slice(0, 10);
  const h = Number(effortHours);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !Number.isFinite(h) || h <= 0) return null;
  const daysNeeded = Math.max(1, Math.ceil(h / HOURS_PER_MANDAY));
  const d = new Date(`${start}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  let added = 0;
  while (added < daysNeeded) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) added += 1;
  }
  return d.toISOString().slice(0, 10);
}

/**
 * Why the schedule suggest button cannot fill the end-date field.
 * @returns {'missing_start'|'missing_effort'|null}
 */
export function suggestEndDateBlockReason(startIso, effortHours) {
  const start = String(startIso || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return 'missing_start';
  const h = Number(effortHours);
  if (!Number.isFinite(h) || h <= 0) return 'missing_effort';
  return null;
}

const STAFFING_SUGGEST_REASON_KEYS = Object.freeze({
  position_preferred: 'workspace.phase1StaffingReasonPosition',
  cv_verified: 'workspace.phase1StaffingReasonVerified',
  prior_role: 'workspace.phase1StaffingReasonPriorRole',
});

function roundStaffingHours(value) {
  return Math.round(Number(value) * 100) / 100;
}

/**
 * HITL plan for Duyệt tất cả. Does not call APIs.
 * remainingHours is one map by userId across every role.
 * @param {Array<{ id, externalKey, roleKey, effortHours, assigneeUserId }>} leaves
 * @param {Record<string, Array<{ userId, score, availableHours, displayName, suggestReasons }>>} candidatesByRole
 */
export function planBulkStaffingAssignments(leaves, candidatesByRole) {
  const list = Array.isArray(leaves) ? leaves : [];
  const byRole = candidatesByRole && typeof candidatesByRole === 'object' ? candidatesByRole : {};
  const rowsByRole = new Map();
  for (const [key, rows] of Object.entries(byRole)) {
    rowsByRole.set(String(key).trim().toLowerCase(), Array.isArray(rows) ? rows : []);
  }
  const remaining = new Map();

  for (const rows of rowsByRole.values()) {
    for (const row of Array.isArray(rows) ? rows : []) {
      const uid = String(row?.userId || '').trim();
      if (!uid || remaining.has(uid)) continue;
      const hours = Number(row?.availableHours);
      if (!Number.isFinite(hours)) continue;
      remaining.set(uid, hours);
    }
  }

  for (const leaf of list) {
    const assignee = String(leaf?.assigneeUserId || '').trim();
    const effort = Number(leaf?.effortHours);
    if (!assignee || !Number.isFinite(effort) || effort <= 0) continue;
    if (!remaining.has(assignee)) continue;
    remaining.set(assignee, roundStaffingHours(remaining.get(assignee) - effort));
  }

  const ordered = list.slice().sort((a, b) => {
    const ha = Number(a?.effortHours);
    const hb = Number(b?.effortHours);
    const aHours = Number.isFinite(ha) ? ha : -1;
    const bHours = Number.isFinite(hb) ? hb : -1;
    if (bHours !== aHours) return bHours - aHours;
    return String(a?.externalKey || '').localeCompare(String(b?.externalKey || ''), 'en');
  });

  const assignments = [];
  const skipped = [];

  for (const leaf of ordered) {
    const id = String(leaf?.id || '').trim();
    if (String(leaf?.assigneeUserId || '').trim()) {
      skipped.push({ id, reason: 'already_assigned' });
      continue;
    }
    const roleKey = String(leaf?.roleKey || '').trim().toLowerCase();
    if (!roleKey) {
      skipped.push({ id, reason: 'missing_role' });
      continue;
    }
    const effort = Number(leaf?.effortHours);
    if (!Number.isFinite(effort) || effort <= 0) {
      skipped.push({ id, reason: 'missing_effort' });
      continue;
    }
    const ranked = (rowsByRole.get(roleKey) || []).slice().sort((a, b) => {
      if ((Number(b?.score) || 0) !== (Number(a?.score) || 0)) {
        return (Number(b?.score) || 0) - (Number(a?.score) || 0);
      }
      return String(a?.displayName || '').localeCompare(String(b?.displayName || ''), 'vi');
    });
    let picked = null;
    for (const row of ranked) {
      const uid = String(row?.userId || '').trim();
      if (!uid) continue;
      if (!remaining.has(uid)) {
        const seeded = Number(row?.availableHours);
        if (!Number.isFinite(seeded)) continue;
        remaining.set(uid, seeded);
      }
      if (remaining.get(uid) >= effort) {
        picked = row;
        break;
      }
    }
    if (!picked) {
      skipped.push({ id, reason: 'insufficient_hours' });
      continue;
    }
    const uid = String(picked.userId).trim();
    const next = roundStaffingHours(remaining.get(uid) - effort);
    remaining.set(uid, next);
    assignments.push({
      id,
      userId: uid,
      displayName: String(picked.displayName || '').trim(),
      suggestReasons: Array.isArray(picked.suggestReasons) ? picked.suggestReasons.filter(Boolean) : [],
      remainingHoursAfter: next,
    });
  }

  return { assignments, skipped };
}

/**
 * Vietnamese/English caption from reason codes plus remaining hours.
 * @param {string[]} suggestReasons
 * @param {number} hours
 * @param {(key: string, vars?: object) => string} translate
 */
export function buildStaffingSuggestionCaption(suggestReasons, hours, translate) {
  const t = typeof translate === 'function' ? translate : (key) => key;
  const sentences = [];
  for (const code of Array.isArray(suggestReasons) ? suggestReasons : []) {
    const key = STAFFING_SUGGEST_REASON_KEYS[code];
    if (key) sentences.push(t(key));
  }
  const n = Number(hours);
  if (Number.isFinite(n)) {
    sentences.push(t('workspace.phase1StaffingRemainingHours', { hours: n }));
  }
  return sentences.filter(Boolean).join(' · ');
}

export function normalizeStaffingStep(raw) {
  const s = String(raw || '')
    .trim()
    .toLowerCase();
  if (STAFFING_STEPS.includes(s)) return s;
  return 'wbs';
}
