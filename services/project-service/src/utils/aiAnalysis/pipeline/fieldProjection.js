/**
 * Field projection — only whitelist fields from each source into snapshot.projected.
 * Employee shape: employeeId, role, skills, availability, workload, history (no PII).
 */

const { SKILL_CATALOG_VERSION } = require('./pipelineConstants');
const {
  buildProjectContextSlice,
  buildRequirementFrSlices,
} = require('../aiAnalysisFrSlice');

function projectFrNode(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    externalId: String(row.externalId || '').trim(),
    level: String(row.level || '').trim(),
    parentExternalId: String(row.parentExternalId || '').trim(),
    name: String(row.name || '').trim(),
    description: String(row.description || '').trim(),
    priority: String(row.priority || '').trim() || undefined,
    actor: String(row.actor || '').trim() || undefined,
    acceptanceCriteria: String(row.acceptanceCriteria || '').trim() || undefined,
    moduleLabel: String(row.moduleLabel || '').trim() || undefined,
    featureLabel: String(row.featureLabel || '').trim() || undefined,
    suggestedSkills: Array.isArray(row.suggestedSkills)
      ? row.suggestedSkills.map(String).slice(0, 20)
      : undefined,
    suggestedRoleKey: String(row.suggestedRoleKey || '').trim() || undefined,
    estimateHours:
      row.estimateHours != null && Number.isFinite(Number(row.estimateHours))
        ? Number(row.estimateHours)
        : undefined,
  };
}

function projectNfr(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    externalId: String(row.externalId || '').trim(),
    category: String(row.category || '').trim(),
    requirement: String(row.requirement || '').trim(),
    priority: String(row.priority || '').trim() || undefined,
    target: String(row.target || '').trim() || undefined,
  };
}

function skillsFromPoolItem(item) {
  if (Array.isArray(item?.skills) && item.skills.length) {
    return item.skills.slice(0, 20).map((s) => {
      if (typeof s === 'string') return { name: s };
      return {
        name: String(s.name || s.skillName || '').trim(),
        level: s.level != null ? Number(s.level) : undefined,
      };
    });
  }
  const capSkills = item?.capability?.skills;
  if (!Array.isArray(capSkills)) return [];
  return capSkills.slice(0, 20).map((s) => ({
    name: String(s.name || s.skillName || '').trim(),
    level: s.level != null ? Number(s.level) : undefined,
  }));
}

/**
 * Clean employee projection — no email/avatar/displayName.
 */
function projectEmployee(item) {
  if (!item || typeof item !== 'object') return null;
  const userId = String(item.userId || item.employeeId || '').trim();
  if (!userId) return null;
  const history = Array.isArray(item?.capability?.projectExperiences)
    ? item.capability.projectExperiences.slice(0, 8).map((e) => ({
        role: String(e.role || e.projectRole || '').trim() || undefined,
        domain: String(e.domain || e.businessDomain || '').trim() || undefined,
        months: e.months != null ? Number(e.months) : undefined,
      }))
    : [];

  const role = String(item.jobTitle || item.membershipRole || '').trim() || undefined;
  const skills = skillsFromPoolItem(item);

  return {
    employeeId: userId,
    userId,
    role,
    // Matching compat
    jobTitle: role,
    membershipRole: String(item.membershipRole || '').trim() || undefined,
    skills,
    availability: item.availability,
    workload: {
      allocatedPct: item.allocatedPct,
      availablePct: item.availablePct,
      capacityRange: item.capacityRange || undefined,
    },
    allocatedPct: item.allocatedPct,
    availablePct: item.availablePct,
    capacityRange: item.capacityRange || undefined,
    history,
    // Matching still reads capability.skills
    capability: {
      skills: Array.isArray(item?.capability?.skills)
        ? item.capability.skills.slice(0, 20).map((s) => ({
            name: String(s.name || s.skillName || '').trim(),
            level: s.level != null ? Number(s.level) : undefined,
          }))
        : skills,
      seniority: item?.capability?.seniority,
      primaryDomain: item?.capability?.primaryDomain,
      projectExperiences: history.length ? history : undefined,
    },
    isActive: item.isActive !== false,
  };
}

/**
 * @param {object} pack — RequirementPack lean/toObject
 * @param {object[]} poolItems
 * @param {{ workingCalendar?: object, holidays?: object[] }} calendar
 * @param {{ skillNames?: string[] }} skillCatalog
 */
function projectAllSources({ pack, poolItems = [], calendar = {}, skillCatalog = {} } = {}) {
  const overview = pack?.overview || {};
  const staffing = pack?.staffingPlan || {};
  const frProjected = (pack?.functionalRequirements || [])
    .map(projectFrNode)
    .filter(Boolean)
    .slice(0, 500);

  return {
    srs: {
      versionNumber: Number(pack?.versionNumber) || 1,
      templateVersion: String(pack?.templateVersion || ''),
      overview: {
        ...buildProjectContextSlice(pack),
        startDate: overview.startDate || staffing.startDate || null,
        deadline: overview.deadline || null,
        businessScope: String(overview.businessScope || '').slice(0, 500) || undefined,
      },
      functionalRequirements: frProjected,
      frSlices: buildRequirementFrSlices(pack, { maxItems: 200 }),
      nonFunctionalRequirements: (pack?.nonFunctionalRequirements || [])
        .map(projectNfr)
        .filter(Boolean)
        .slice(0, 100),
      staffingPlan: {
        requiredSkills: (staffing.requiredSkills || []).slice(0, 40).map((s) => ({
          name: String(s.name || '').trim(),
          requiredLevel: s.requiredLevel,
          source: s.source,
        })),
        requiredRoles: (staffing.requiredRoles || []).slice(0, 40).map((r) => ({
          roleKey: String(r.roleKey || '').trim(),
          requiredCount: r.requiredCount,
          source: r.source,
        })),
        estimatedHoursTotal: staffing.estimatedHoursTotal,
        startDate: staffing.startDate || null,
      },
      requirementSkills: (pack?.requirementSkills || []).slice(0, 200).map((r) => ({
        externalId: String(r.externalId || '').trim(),
        skillNameSnapshot: String(r.skillNameSnapshot || r.rawInput || '').trim(),
        rawInput: String(r.rawInput || '').trim() || undefined,
        requiredLevel: r.requiredLevel,
        importance: r.importance,
      })),
      technology: (pack?.technology || []).slice(0, 40).map((t) => ({
        category: String(t.category || '').trim(),
        name: String(t.name || '').trim(),
        version: String(t.version || '').trim() || undefined,
        mandatory: Boolean(t.mandatory),
      })),
    },
    employees: (poolItems || []).map(projectEmployee).filter(Boolean),
    skillCatalog: {
      version: String(skillCatalog.version || SKILL_CATALOG_VERSION),
      skills: Array.isArray(skillCatalog.skills)
        ? skillCatalog.skills.map(String).slice(0, 200)
        : [],
    },
    calendar: {
      workingCalendar: calendar.workingCalendar || {},
      holidays: Array.isArray(calendar.holidays) ? calendar.holidays : [],
    },
  };
}

module.exports = {
  projectFrNode,
  projectNfr,
  projectEmployee,
  projectAllSources,
  skillsFromPoolItem,
};
