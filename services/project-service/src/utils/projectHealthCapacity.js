/**
 * Capacity portfolio: Planned Allocation từ ProjectMember (cùng service).
 * Không gọi org/user S2S — khác % giờ thẻ.
 */
const {
  flattenSegments,
  allocatedPctOnDay,
  toDayMs,
  classifyAvailability,
} = require('./allocationOverlap');

function emptyCapacitySummary() {
  return {
    metric: 'planned_allocation',
    peopleOnListedProjects: 0,
    overallocatedPeople: 0,
  };
}

function summarizePortfolioCapacity(memberRows = [], { projectIds = [], asOf = new Date() } = {}) {
  const projectSet = new Set((projectIds || []).map((id) => String(id || '')).filter(Boolean));
  const byUser = new Map();
  for (const row of memberRows || []) {
    const uid = String(row?.userId || '');
    if (!uid) continue;
    if (!byUser.has(uid)) byUser.set(uid, []);
    byUser.get(uid).push(row);
  }
  const dayMs = toDayMs(asOf) ?? toDayMs(new Date());
  const listedUsers = new Set();
  let overallocatedPeople = 0;
  for (const [uid, rows] of byUser) {
    const onListed = rows.some((r) => projectSet.has(String(r.projectId || '')));
    if (!onListed) continue;
    listedUsers.add(uid);
    const pct = allocatedPctOnDay(flattenSegments(rows), dayMs);
    if (classifyAvailability(pct) === 'overallocated') overallocatedPeople += 1;
  }
  return {
    metric: 'planned_allocation',
    peopleOnListedProjects: listedUsers.size,
    overallocatedPeople,
  };
}

module.exports = {
  emptyCapacitySummary,
  summarizePortfolioCapacity,
};
