/**
 * Canonicalize projected SRS + system datasets onto shared reference ids.
 */

const { canonicalizeRole } = require('./canonicalRoleMap');
const { canonicalizeTech } = require('./canonicalTechMap');
const { canonicalizeSkill } = require('./canonicalSkillMap');

function mapSkillList(skills = []) {
  return (skills || [])
    .map((s) => {
      const name = typeof s === 'string' ? s : s?.name;
      const mapped = canonicalizeSkill(name);
      if (!mapped.canonicalId) return null;
      return {
        ...mapped,
        level: typeof s === 'object' && s?.level != null ? Number(s.level) : undefined,
      };
    })
    .filter(Boolean);
}

/**
 * @param {object} projected — from projectAllSources
 */
function canonicalizeProjected(projected = {}) {
  const srs = projected.srs || {};
  const fr = (srs.functionalRequirements || []).map((row) => {
    const role = canonicalizeRole(row.suggestedRoleKey || '');
    const skills = mapSkillList(row.suggestedSkills || []);
    return {
      ...row,
      roleCanonical: role.canonicalId || undefined,
      roleUnmapped: role.unmapped || undefined,
      skillCanonicalIds: skills.map((s) => s.canonicalId).filter(Boolean),
      skillsCanonical: skills,
    };
  });

  const technology = (srs.technology || []).map((t) => {
    const tech = canonicalizeTech(t.name);
    return {
      ...t,
      techCanonicalId: tech.canonicalId,
      techUnmapped: tech.unmapped,
    };
  });

  const staffingRoles = (srs.staffingPlan?.requiredRoles || []).map((r) => {
    const role = canonicalizeRole(r.roleKey);
    return {
      ...r,
      roleCanonicalId: role.canonicalId,
      roleUnmapped: role.unmapped,
    };
  });

  const staffingSkills = (srs.staffingPlan?.requiredSkills || []).map((s) => {
    const sk = canonicalizeSkill(s.name);
    return {
      ...s,
      skillCanonicalId: sk.canonicalId,
      skillUnmapped: sk.unmapped,
    };
  });

  const requirementSkills = (srs.requirementSkills || []).map((r) => {
    const sk = canonicalizeSkill(r.skillNameSnapshot || r.rawInput);
    return {
      ...r,
      skillCanonicalId: sk.canonicalId,
      skillUnmapped: sk.unmapped,
    };
  });

  const employees = (projected.employees || []).map((emp) => {
    const role = canonicalizeRole(emp.role || emp.jobTitle || emp.membershipRole);
    const skills = mapSkillList(emp.skills || emp.capability?.skills || []);
    return {
      ...emp,
      roleCanonicalId: role.canonicalId,
      roleUnmapped: role.unmapped,
      skillsCanonical: skills,
      skillCanonicalIds: skills.map((s) => s.canonicalId).filter(Boolean),
    };
  });

  const catalogSkills = (projected.skillCatalog?.skills || []).map((name) => {
    const sk = canonicalizeSkill(name);
    return { name, ...sk };
  });

  return {
    fr,
    technology,
    staffing: {
      requiredRoles: staffingRoles,
      requiredSkills: staffingSkills,
      estimatedHoursTotal: srs.staffingPlan?.estimatedHoursTotal,
      startDate: srs.staffingPlan?.startDate || null,
    },
    requirementSkills,
    employees,
    skillCatalog: {
      version: projected.skillCatalog?.version,
      skills: catalogSkills,
    },
    calendar: projected.calendar || { workingCalendar: {}, holidays: [] },
    overview: srs.overview || {},
    frSlices: srs.frSlices || [],
    nonFunctionalRequirements: srs.nonFunctionalRequirements || [],
    idMaps: {
      roles: Object.fromEntries(
        staffingRoles
          .filter((r) => r.roleKey && r.roleCanonicalId)
          .map((r) => [r.roleKey, r.roleCanonicalId])
      ),
      tech: Object.fromEntries(
        technology
          .filter((t) => t.name && t.techCanonicalId)
          .map((t) => [t.name, t.techCanonicalId])
      ),
      skills: Object.fromEntries(
        requirementSkills
          .filter((r) => (r.skillNameSnapshot || r.rawInput) && r.skillCanonicalId)
          .map((r) => [r.skillNameSnapshot || r.rawInput, r.skillCanonicalId])
      ),
    },
  };
}

module.exports = {
  canonicalizeProjected,
  mapSkillList,
};
