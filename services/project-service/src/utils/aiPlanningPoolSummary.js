/**
 * Aggregate org resource pool for LLM staffing prompt — no PII.
 */

const TOP_SKILLS_MAX = 12;
const TOP_ROLE_HEADCOUNT_MAX = 12;

const {
  inferProjectRoleKeysFromJobTitle,
} = require('./positionCandidateMatch');

function normalizeSkillName(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase();
}

function seniorityBucket(band) {
  const key = String(band || '')
    .trim()
    .toLowerCase();
  if (['senior', 'lead', 'principal'].includes(key)) return 'senior';
  if (key === 'mid') return 'mid';
  if (['junior', 'intern'].includes(key)) return 'junior';
  return 'other';
}

function buildRoleHeadcount(poolItems = []) {
  const counts = new Map();
  for (const item of poolItems) {
    const roleKeys = inferProjectRoleKeysFromJobTitle(item?.jobTitle || '');
    for (const roleKey of roleKeys) {
      counts.set(roleKey, (counts.get(roleKey) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([roleKey, count]) => ({ roleKey, count }))
    .sort((a, b) => b.count - a.count || a.roleKey.localeCompare(b.roleKey))
    .slice(0, TOP_ROLE_HEADCOUNT_MAX);
}

/**
 * @param {object[]} poolItems — verified pool rows from listOrgResourcePool
 */
function buildOrgPoolSummary(poolItems = []) {
  const items = Array.isArray(poolItems) ? poolItems : [];
  const headcount = items.length;

  if (!headcount) {
    return {
      headcount: 0,
      avgAvailablePct: null,
      availabilityBreakdown: { available: 0, partial: 0, overallocated: 0 },
      topSkills: [],
      seniorityBands: { senior: 0, mid: 0, junior: 0, other: 0 },
      avgAvailableHours: null,
      roleHeadcount: [],
    };
  }

  const availabilityBreakdown = { available: 0, partial: 0, overallocated: 0 };
  const seniorityBands = { senior: 0, mid: 0, junior: 0, other: 0 };
  const skillCounts = new Map();
  let availPctSum = 0;
  let availPctCount = 0;
  let hoursSum = 0;
  let hoursCount = 0;

  for (const item of items) {
    const avail = String(item?.availability || '').toLowerCase();
    if (avail === 'available') availabilityBreakdown.available += 1;
    else if (avail === 'partial') availabilityBreakdown.partial += 1;
    else if (avail === 'overallocated') availabilityBreakdown.overallocated += 1;

    const pct = Number(item?.availablePct);
    if (Number.isFinite(pct)) {
      availPctSum += pct;
      availPctCount += 1;
    }

    const hours = Number(item?.capacityRange?.availableHours);
    if (Number.isFinite(hours)) {
      hoursSum += hours;
      hoursCount += 1;
    }

    const band = seniorityBucket(item?.capability?.seniorityBand);
    seniorityBands[band] += 1;

    for (const skill of item?.capability?.skills || []) {
      const name = String(skill?.name || '').trim();
      if (!name) continue;
      const key = normalizeSkillName(name);
      const prev = skillCounts.get(key) || { name, count: 0 };
      prev.count += 1;
      skillCounts.set(key, prev);
    }
  }

  const topSkills = [...skillCounts.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, TOP_SKILLS_MAX)
    .map((row) => ({ name: row.name, count: row.count }));

  return {
    headcount,
    avgAvailablePct:
      availPctCount > 0 ? Math.round((availPctSum / availPctCount) * 10) / 10 : null,
    availabilityBreakdown,
    topSkills,
    seniorityBands,
    avgAvailableHours:
      hoursCount > 0 ? Math.round((hoursSum / hoursCount) * 10) / 10 : null,
    roleHeadcount: buildRoleHeadcount(items),
  };
}

module.exports = {
  TOP_SKILLS_MAX,
  TOP_ROLE_HEADCOUNT_MAX,
  buildOrgPoolSummary,
  buildRoleHeadcount,
  seniorityBucket,
};
