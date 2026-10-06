/**
 * Strip UserProfile.capability to verified-only payload for resource pool / profile APIs.
 * Unverified → null.
 */
function stripVerifiedCapability(capability) {
  if (!capability || capability.verificationStatus !== 'verified') return null;
  const projectExperiences = (
    Array.isArray(capability.projectExperiences) ? capability.projectExperiences : []
  ).filter((p) => p?.status === 'verified');
  return {
    primaryDomain: capability.primaryDomain || '',
    seniorityBand: capability.seniorityBand || '',
    yearsExperience: capability.yearsExperience,
    skills: Array.isArray(capability.skills) ? capability.skills : [],
    businessDomains: Array.isArray(capability.businessDomains) ? capability.businessDomains : [],
    certifications: (Array.isArray(capability.certifications) ? capability.certifications : []).filter(
      (c) => c?.verificationStatus === 'verified'
    ),
    languages: capability.languages || [],
    tools: capability.tools || [],
    availability: capability.availability || 'available',
    summary: capability.summary || '',
    verificationStatus: 'verified',
    verifiedAt: capability.verifiedAt || null,
    projectExperiences,
  };
}

/** Compact capability snippet for pool list rows (AI planning uses up to 8). */
function compactProjectExperiencesForPool(experiences, limit = 8) {
  return (Array.isArray(experiences) ? experiences : [])
    .filter((row) => row?.status === 'verified')
    .slice(0, limit)
    .map((row) => {
      const domain = String(row.domain || row.businessDomain || '')
        .trim()
        .slice(0, 80);
      const monthsRaw = row.months;
      const months =
        monthsRaw != null && Number.isFinite(Number(monthsRaw))
          ? Math.max(0, Math.min(600, Math.floor(Number(monthsRaw))))
          : undefined;
      const sourceRaw = String(row.source || '').trim();
      const source = ['cv_parse', 'closed_board', 'excel_import', 'manual'].includes(sourceRaw)
        ? sourceRaw
        : undefined;
      return {
        name: String(row.name || '').slice(0, 120) || undefined,
        role: String(row.role || '').slice(0, 64) || undefined,
        work: String(row.work || '').slice(0, 120) || undefined,
        year: row.year ?? null,
        ...(domain ? { domain } : {}),
        ...(months != null ? { months } : {}),
        ...(source ? { source } : {}),
      };
    });
}

function stripVerifiedCapabilityForPool(capability, options = {}) {
  const full = stripVerifiedCapability(capability);
  if (!full) return null;
  const out = {
    primaryDomain: full.primaryDomain,
    seniorityBand: full.seniorityBand,
    yearsExperience: full.yearsExperience,
    skills: full.skills,
    businessDomains: full.businessDomains,
    availability: full.availability,
    verifiedAt: full.verifiedAt,
  };
  if (options.includeProjectExperiences) {
    out.projectExperiences = compactProjectExperiencesForPool(full.projectExperiences);
  }
  return out;
}

module.exports = {
  stripVerifiedCapability,
  stripVerifiedCapabilityForPool,
  compactProjectExperiencesForPool,
};
