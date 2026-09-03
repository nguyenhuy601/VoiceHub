/**
 * Compact candidate context for LLM ranking enrich (no PII beyond displayName).
 */

const {
  resolvePositionKeyFromJobTitle,
  preferredPositionsForProjectRole,
  scorePositionMatch,
} = require('./positionCandidateMatch');
const { compactProjectExperiencesForPool } = require('./verifiedCapabilityStrip');

const MAX_ENRICH_BYTES = 8 * 1024;

function normalizeUserId(userId) {
  return String(userId || '').trim();
}

function buildPoolByUserId(poolItems = []) {
  const map = new Map();
  for (const item of poolItems) {
    const key = normalizeUserId(item?.userId);
    if (key) map.set(key, item);
  }
  return map;
}

function compactProjectExperiences(experiences, limit = 3) {
  return compactProjectExperiencesForPool(experiences, limit);
}

function normalizeExperienceToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function projectExperienceOverlap(poolItem, roleKey) {
  const experiences = poolItem?.capability?.projectExperiences || [];
  if (!experiences.length || !roleKey) return false;

  const tokens = new Set([normalizeExperienceToken(roleKey)]);
  for (const positionKey of preferredPositionsForProjectRole(roleKey)) {
    tokens.add(normalizeExperienceToken(positionKey));
  }

  for (const row of experiences) {
    const expRole = normalizeExperienceToken(row?.role);
    if (expRole && tokens.has(expRole)) return true;
  }
  return false;
}

function hasEnrichEvidence(suggestion, poolItem, roleKey) {
  if ((suggestion?.matchedSkills || []).length > 0) return true;
  const jobTitle = suggestion?.jobTitle || poolItem?.jobTitle || '';
  const position = scorePositionMatch({
    jobTitle,
    projectRoleKey: roleKey,
    enabledPositionKeys: null,
  });
  if (position.preferred) return true;
  if (projectExperienceOverlap(poolItem, roleKey)) return true;
  return false;
}

function buildEnrichCandidatePayload(suggestion, poolItem, roleKey) {
  const cap = poolItem?.capability || {};
  return {
    userId: suggestion.userId,
    displayName: suggestion.displayName,
    jobTitle: suggestion.jobTitle || poolItem?.jobTitle || '',
    seniorityBand: suggestion.seniorityBand || cap.seniorityBand || '',
    yearsExperience: cap.yearsExperience ?? null,
    projectExperiences: compactProjectExperiences(cap.projectExperiences),
    score: suggestion.score,
    matchedSkills: suggestion.matchedSkills || [],
    availableHours: suggestion.availableHours,
    heuristicReasons: (suggestion.reasons || []).slice(0, 6),
    positionMatchKey: resolvePositionKeyFromJobTitle(suggestion.jobTitle || poolItem?.jobTitle || ''),
  };
}

function buildEnrichCompactFromRoles(overlayRoles, poolItems = []) {
  const poolByUserId = buildPoolByUserId(poolItems);
  return (overlayRoles || []).map((role) => {
    const roleKey = String(role.roleKey || '').trim().toLowerCase();
    return {
      roleKey,
      requiredCount: role.requiredCount,
      suggestions: (role.suggestions || []).slice(0, 5).map((s) => {
        const poolItem = poolByUserId.get(normalizeUserId(s.userId));
        return buildEnrichCandidatePayload(s, poolItem, roleKey);
      }),
    };
  });
}

function shrinkEnrichCompact(compact, maxBytes = MAX_ENRICH_BYTES) {
  let payload = compact;
  let bytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
  if (bytes <= maxBytes) return payload;

  payload = payload.map((role) => ({
    ...role,
    suggestions: (role.suggestions || []).map((s) => {
      const next = { ...s };
      delete next.projectExperiences;
      return next;
    }),
  }));
  bytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
  if (bytes <= maxBytes) return payload;

  payload = payload.map((role) => ({
    ...role,
    suggestions: (role.suggestions || []).map((s) => {
      const next = { ...s };
      delete next.yearsExperience;
      return next;
    }),
  }));
  bytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
  if (bytes <= maxBytes) return payload;

  return payload.map((role) => ({
    ...role,
    suggestions: (role.suggestions || []).slice(0, 3),
  }));
}

module.exports = {
  MAX_ENRICH_BYTES,
  normalizeUserId,
  buildPoolByUserId,
  compactProjectExperiences,
  projectExperienceOverlap,
  hasEnrichEvidence,
  buildEnrichCandidatePayload,
  buildEnrichCompactFromRoles,
  shrinkEnrichCompact,
};
