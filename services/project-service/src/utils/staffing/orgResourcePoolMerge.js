/**
 * Pure helpers for org resource pool merge/filter — unit-testable without S2S.
 */

const AVAILABILITY_RANK = Object.freeze({
  available: 0,
  partial: 1,
  overallocated: 2,
});

function emptyPlacement() {
  return {
    departmentId: '',
    departmentName: '',
    teamId: '',
    teamName: '',
  };
}

/**
 * Build user → placement from department roster (additive `teams[]` from org-service).
 * First-wins for dept and team (parity with structurePlacement.buildPlacementMaps).
 * @param {Array<{
 *   departmentId?: string,
 *   name?: string,
 *   memberIds?: string[],
 *   teams?: Array<{ teamId?: string, name?: string, memberIds?: string[] }>
 * }>} departments
 * @returns {Map<string, { departmentId, departmentName, teamId, teamName }>}
 */
function buildPlacementByUser(departments = []) {
  const map = new Map();

  for (const dep of departments || []) {
    const departmentId = String(dep.departmentId || dep._id || '').trim();
    const departmentName = String(dep.name || '').trim();
    for (const uid of dep.memberIds || []) {
      const userId = String(uid || '').trim();
      if (!userId || map.has(userId)) continue;
      map.set(userId, {
        departmentId,
        departmentName,
        teamId: '',
        teamName: '',
      });
    }
  }

  for (const dep of departments || []) {
    const departmentId = String(dep.departmentId || dep._id || '').trim();
    const departmentName = String(dep.name || '').trim();
    for (const team of dep.teams || []) {
      const teamId = String(team?.teamId || team?._id || '').trim();
      const teamName = String(team?.name || '').trim();
      if (!teamId) continue;
      for (const uid of team.memberIds || []) {
        const userId = String(uid || '').trim();
        if (!userId) continue;
        const existing = map.get(userId);
        if (!existing) {
          map.set(userId, {
            departmentId,
            departmentName,
            teamId,
            teamName,
          });
          continue;
        }
        if (!existing.teamId) {
          existing.teamId = teamId;
          existing.teamName = teamName;
        }
        if (!existing.departmentId && departmentId) {
          existing.departmentId = departmentId;
          existing.departmentName = departmentName;
        }
      }
    }
  }

  return map;
}

/**
 * Unique memberships by userId (first wins).
 * @param {Array<{ userId: string, role?: string }>} memberships
 */
function uniqueMemberships(memberships = []) {
  const byUser = new Map();
  for (const row of memberships || []) {
    const userId = String(row?.userId || '').trim();
    if (!userId || byUser.has(userId)) continue;
    byUser.set(userId, {
      userId,
      role: String(row?.role || '').trim().toLowerCase(),
    });
  }
  return [...byUser.values()];
}

function clampPoolLimit(limit, { defaultLimit = 500, maxLimit = 1000 } = {}) {
  const n = Number(limit);
  if (!Number.isFinite(n) || n <= 0) return defaultLimit;
  return Math.min(Math.floor(n), maxLimit);
}

/**
 * @param {object[]} items
 * @param {{ verifiedOnly?: boolean, departmentId?: string }} filters
 */
function filterPoolItems(items = [], { verifiedOnly = false, departmentId = '' } = {}) {
  const dept = String(departmentId || '').trim();
  return (items || []).filter((item) => {
    if (verifiedOnly && !item.capability) return false;
    if (dept && String(item.placement?.departmentId || '') !== dept) return false;
    return true;
  });
}

function sortPoolItems(items = []) {
  return [...items].sort((a, b) => {
    const ra = AVAILABILITY_RANK[a.availability] ?? 9;
    const rb = AVAILABILITY_RANK[b.availability] ?? 9;
    if (ra !== rb) return ra - rb;
    return String(a.displayName || '').localeCompare(String(b.displayName || ''), 'vi');
  });
}

/**
 * Range mode: availability from capacityRange, then availableHours desc, then name.
 */
function sortPoolItemsByRange(items = []) {
  return [...items].sort((a, b) => {
    const ra = AVAILABILITY_RANK[a.capacityRange?.availability] ?? 9;
    const rb = AVAILABILITY_RANK[b.capacityRange?.availability] ?? 9;
    if (ra !== rb) return ra - rb;
    const ha = Number(a.capacityRange?.availableHours) || 0;
    const hb = Number(b.capacityRange?.availableHours) || 0;
    if (hb !== ha) return hb - ha;
    return String(a.displayName || '').localeCompare(String(b.displayName || ''), 'vi');
  });
}

function computePoolTotals(items = []) {
  let withVerifiedCapability = 0;
  let availablePeople = 0;
  let overallocatedPeople = 0;
  for (const item of items || []) {
    if (item.capability) withVerifiedCapability += 1;
    if (item.availability === 'available') availablePeople += 1;
    if (item.availability === 'overallocated') overallocatedPeople += 1;
  }
  return {
    headcount: (items || []).length,
    withVerifiedCapability,
    availablePeople,
    overallocatedPeople,
  };
}

function computePoolRangeTotals(items = []) {
  let grossHours = 0;
  let availableHours = 0;
  let allocatedHours = 0;
  for (const item of items || []) {
    const r = item.capacityRange;
    if (!r) continue;
    grossHours += Number(r.grossHours) || 0;
    availableHours += Number(r.availableHours) || 0;
    allocatedHours += Number(r.allocatedHours) || 0;
  }
  return {
    headcount: (items || []).length,
    grossHours: Math.round(grossHours * 100) / 100,
    availableHours: Math.round(availableHours * 100) / 100,
    allocatedHours: Math.round(allocatedHours * 100) / 100,
  };
}

module.exports = {
  emptyPlacement,
  buildPlacementByUser,
  uniqueMemberships,
  clampPoolLimit,
  filterPoolItems,
  sortPoolItems,
  sortPoolItemsByRange,
  computePoolTotals,
  computePoolRangeTotals,
  AVAILABILITY_RANK,
};
