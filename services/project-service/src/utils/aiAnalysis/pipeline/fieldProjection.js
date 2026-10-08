/**
 * Field projection — only whitelist fields from each source into snapshot.projected.
 * Employee shape: employeeId, role, skills, availability, workload, history (no PII).
 */

const { SKILL_CATALOG_VERSION } = require('./pipelineConstants');
const {
  buildProjectContextSlice,
  buildRequirementFrSlices,
} = require('../aiAnalysisFrSlice');
const {
  attachSourceIdentity,
  projectAllAnalysisSections,
} = require('./projectAnalysisSections');

function projectFrNode(row, index = 0) {
  if (!row || typeof row !== 'object') return null;
  const identity = attachSourceIdentity(row, {
    section: 'functionalRequirements',
    index,
  });
  return {
    ...identity,
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

function projectNfr(row, index = 0) {
  if (!row || typeof row !== 'object') return null;
  const identity = attachSourceIdentity(row, {
    section: 'nonFunctionalRequirements',
    index,
  });
  return {
    ...identity,
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
 * Domain on history: PE.domain only, else capability.primaryDomain (real profile field — not invented).
 */
function projectEmployee(item) {
  if (!item || typeof item !== 'object') return null;
  const userId = String(item.userId || item.employeeId || '').trim();
  if (!userId) return null;
  const primaryDomain = String(item?.capability?.primaryDomain || '')
    .trim()
    .slice(0, 80);
  const seniorityBand = String(
    item?.capability?.seniorityBand || item?.capability?.seniority || item?.seniorityBand || ''
  ).trim();
  const businessDomains = Array.isArray(item?.capability?.businessDomains)
    ? item.capability.businessDomains.map((d) => String(d || '').trim()).filter(Boolean).slice(0, 12)
    : [];
  const history = Array.isArray(item?.capability?.projectExperiences)
    ? item.capability.projectExperiences.slice(0, 8).map((e) => {
        const peDomain = String(e.domain || e.businessDomain || '').trim();
        const domain = peDomain || primaryDomain || undefined;
        const months =
          e.months != null && Number.isFinite(Number(e.months))
            ? Number(e.months)
            : undefined;
        const projectName = String(e.name || e.projectName || '').trim() || undefined;
        const work = String(e.work || '').trim().slice(0, 120) || undefined;
        const sourceRaw = String(e.source || '').trim();
        const source = ['cv_parse', 'closed_board', 'excel_import', 'manual'].includes(sourceRaw)
          ? sourceRaw
          : undefined;
        return {
          role: String(e.role || e.projectRole || '').trim() || undefined,
          domain: domain || undefined,
          months,
          projectName,
          work,
          year: e.year != null ? e.year : undefined,
          ...(source ? { source } : {}),
        };
      })
    : [];

  const role = String(item.jobTitle || item.membershipRole || '').trim() || undefined;
  const skills = skillsFromPoolItem(item);
  const maxConcurrentProjects =
    item.maxConcurrentProjects ?? item.resourceConfig?.maxConcurrentProjects ?? null;
  const projectCount =
    item.projectCount ?? item.activeProjectCount ?? item.activeProjects ?? null;

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
    projectCount: projectCount != null && Number.isFinite(Number(projectCount))
      ? Number(projectCount)
      : undefined,
    maxConcurrentProjects:
      maxConcurrentProjects != null && Number.isFinite(Number(maxConcurrentProjects))
        ? Number(maxConcurrentProjects)
        : undefined,
    resourceConfig:
      maxConcurrentProjects != null && Number.isFinite(Number(maxConcurrentProjects))
        ? { maxConcurrentProjects: Number(maxConcurrentProjects) }
        : undefined,
    // Matching still reads capability.skills / seniorityBand
    capability: {
      skills: Array.isArray(item?.capability?.skills)
        ? item.capability.skills.slice(0, 20).map((s) => ({
            name: String(s.name || s.skillName || '').trim(),
            level: s.level != null ? Number(s.level) : undefined,
          }))
        : skills,
      seniority: seniorityBand || item?.capability?.seniority || undefined,
      seniorityBand: seniorityBand || undefined,
      primaryDomain: primaryDomain || undefined,
      businessDomains: businessDomains.length ? businessDomains : undefined,
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
    .map((row, i) => projectFrNode(row, i))
    .filter(Boolean)
    .slice(0, 500);
  const nfrProjected = (pack?.nonFunctionalRequirements || [])
    .map((row, i) => projectNfr(row, i))
    .filter(Boolean)
    .slice(0, 100);
  const analysisSections = projectAllAnalysisSections(pack);

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
      nonFunctionalRequirements: nfrProjected,
      ...analysisSections,
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
