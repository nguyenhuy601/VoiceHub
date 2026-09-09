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

/** Compact capability snippet for pool list rows. */
function compactProjectExperiencesForPool(experiences, limit = 3) {
  return (Array.isArray(experiences) ? experiences : [])
    .filter((row) => row?.status === 'verified')
    .slice(0, limit)
    .map((row) => ({
      role: String(row.role || '').slice(0, 64),
      work: String(row.work || '').slice(0, 120),
      year: row.year ?? null,
    }));
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
