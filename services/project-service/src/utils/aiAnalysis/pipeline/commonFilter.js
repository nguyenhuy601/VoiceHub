/**
 * Common filter — AFTER canonicalize. Active / named FR / drop non-required UNMAPPED.
 * Overallocated employees are NOT removed here (Matching job filter).
 */

/**
 * @param {object} canonical
 * @param {object} merged — from semanticMerge
 * @param {{ packStatus?: string }} opts
 */
function applyCommonFilter(canonical = {}, merged = {}, opts = {}) {
  const employees = (canonical.employees || []).filter((e) => e && e.isActive !== false);

  const fr = (canonical.fr || []).filter((row) => {
    const id = String(row.externalId || '').trim();
    if (!id) return false;
    const level = String(row.level || '').trim();
    if (level === 'Requirement' || !level) {
      return Boolean(String(row.name || '').trim());
    }
    return true;
  });

  const requirementSkills = (canonical.requirementSkills || []).filter((r) => {
    const unmapped = !r.skillCanonicalId || r.skillCanonicalId === 'SK-UNMAPPED';
    if (unmapped) {
      return String(r.importance || 'required') === 'required';
    }
    return true;
  });

  const staffingSkills = (canonical.staffing?.requiredSkills || []).filter(
    (s) => s.skillCanonicalId && s.skillCanonicalId !== 'SK-UNMAPPED'
  );
  const staffingRoles = (canonical.staffing?.requiredRoles || []).filter(
    (r) => r.roleCanonicalId && r.roleCanonicalId !== 'ROLE-UNMAPPED'
  );

  const technology = (canonical.technology || []).filter((t) => {
    if (t.mandatory === true) return true;
    return t.techCanonicalId && t.techCanonicalId !== 'TECH-UNMAPPED';
  });

  const frSlices = (canonical.frSlices || []).filter((s) => s && s.id);
  const frIdSet = new Set(fr.map((r) => String(r.externalId || '').trim()).filter(Boolean));
  const alignedSlices = frSlices.filter((s) => !frIdSet.size || frIdSet.has(String(s.id)));

  return {
    overview: canonical.overview || {},
    fr,
    frSlices: alignedSlices.length ? alignedSlices : frSlices,
    nonFunctionalRequirements: (canonical.nonFunctionalRequirements || []).filter(
      (n) => n && (n.externalId || n.requirement)
    ),
    employees,
    requirementSkills,
    staffing: {
      requiredSkills: staffingSkills,
      requiredRoles: staffingRoles,
      estimatedHoursTotal: canonical.staffing?.estimatedHoursTotal,
      startDate: canonical.staffing?.startDate || null,
    },
    technology,
    skillCatalog: canonical.skillCatalog,
    calendar: canonical.calendar,
    idMaps: canonical.idMaps,
    merged: {
      frLinks: merged.frLinks || [],
      edges: merged.edges || [],
      requiredSkillIds: merged.requiredSkillIds || [],
      requiredRoleIds: merged.requiredRoleIds || [],
    },
    meta: {
      packStatus: opts.packStatus || null,
      employeeCount: employees.length,
      frCount: fr.length,
      edgeCount: (merged.edges || []).length,
    },
  };
}

module.exports = {
  applyCommonFilter,
};
