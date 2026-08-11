import { memberDepartmentId, memberTeamId, memberUserId } from './adminUserUtils.js';

export function asId(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'object') {
    return String(value._id || value.id || value.userId || '').trim();
  }
  return String(value).trim();
}

/** Id phòng trên cây OU + legacy — dropdown có thể dùng OU id trong khi membership dùng Department._id. */
export function departmentLookupIds(dept) {
  if (!dept || typeof dept !== 'object') return [asId(dept)].filter(Boolean);
  const ids = [
    asId(dept),
    String(dept.ouId || '').trim(),
    String(dept.legacyRef?.id || '').trim(),
    String(dept.id || '').trim(),
  ].filter(Boolean);
  return [...new Set(ids)];
}

function addPersonId(ids, person) {
  const id = asId(person) || memberUserId(person);
  if (id) ids.add(id);
}

/**
 * UserIds thuộc một phòng: head / members / teams + org members theo departmentId.
 */
export function collectDeptMemberIds(dept, orgMembers = []) {
  const ids = new Set();
  if (dept) {
    if (dept.head) addPersonId(ids, dept.head);
    (dept.members || []).forEach((m) => addPersonId(ids, m));
    (dept.teams || []).forEach((team) => {
      if (team?.leader) addPersonId(ids, team.leader);
      (team.members || []).forEach((m) => addPersonId(ids, m));
    });
  }
  const deptIds = new Set(departmentLookupIds(dept));
  const teamIds = new Set((dept?.teams || []).map((t) => asId(t)).filter(Boolean));
  if (deptIds.size) {
    for (const m of orgMembers || []) {
      if (deptIds.has(memberDepartmentId(m))) addPersonId(ids, m);
      else if (teamIds.has(memberTeamId(m))) addPersonId(ids, m);
    }
  }
  return ids;
}

/**
 * Lọc org members theo related department ids. 0 dept → [].
 */
export function filterMembersByRelatedDepts(orgMembers, opts = {}) {
  const deptIds = (Array.isArray(opts.deptIds) ? opts.deptIds : [])
    .map((id) => String(id || '').trim())
    .filter(Boolean);
  if (!deptIds.length) return [];

  const deptById = new Map();
  for (const d of opts.structureDepts || []) {
    const id = asId(d);
    if (id) deptById.set(id, d);
  }

  const allowed = new Set();
  for (const id of deptIds) {
    const dept = deptById.get(id) || { _id: id };
    for (const uid of collectDeptMemberIds(dept, orgMembers)) allowed.add(uid);
  }

  return (Array.isArray(orgMembers) ? orgMembers : []).filter((m) => {
    const uid = memberUserId(m);
    return Boolean(uid && allowed.has(uid));
  });
}

export function isWorkloadFull(row) {
  if (!row || typeof row !== 'object') return false;
  const avail = String(row.availability || row.allocationStatus || '').toLowerCase();
  if (avail === 'overallocated') return true;
  const pct = Number(row.allocatedPct);
  return Number.isFinite(pct) && pct >= 100;
}

export function isWorkloadPartial(row) {
  if (isWorkloadFull(row)) return false;
  return String(row.availability || '').toLowerCase() === 'partial';
}

export function buildPlannerLoadByUserId(items) {
  const map = new Map();
  for (const row of Array.isArray(items) ? items : []) {
    const uid = String(row?.userId || row?.id || '').trim();
    if (!uid) continue;
    const pct = Number(row.allocatedPct);
    map.set(uid, {
      allocatedPct: Number.isFinite(pct) ? pct : null,
      availability: String(row.availability || row.allocationStatus || '').toLowerCase() || null,
      workloadFull: isWorkloadFull(row),
      workloadPartial: isWorkloadPartial(row),
    });
  }
  return map;
}
