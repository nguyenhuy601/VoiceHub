/**
 * Pure capability matching for staffing candidates.
 */

function normalizeKey(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function buildSkillRankMap(skills = []) {
  const map = new Map();
  for (const s of skills || []) {
    const name = normalizeKey(s?.name);
    if (!name) continue;
    const rank = Number(s.rank) >= 1 ? Number(s.rank) : map.size + 1;
    const level = Number(s.level) || 3;
    map.set(name, { rank, level, name: s.name });
  }
  return map;
}

function buildDomainRankMap(domains = []) {
  const map = new Map();
  for (const d of domains || []) {
    const name = normalizeKey(d?.name);
    if (!name) continue;
    const rank = Number(d.rank) >= 1 ? Number(d.rank) : map.size + 1;
    map.set(name, { rank, name: d.name });
  }
  return map;
}

/**
 * Score skill overlap vs required list (canonical names).
 * @param {object} verifiedCapability
 * @param {string[]} requiredSkills
 * @returns {{ boost: number, matched: string[], reasons: string[] }}
 */
function scoreCapabilitySkills(verifiedCapability, requiredSkills = []) {
  const required = (requiredSkills || []).map(normalizeKey).filter(Boolean);
  if (!required.length) return { boost: 0, matched: [], reasons: [] };

  const skillMap = buildSkillRankMap(verifiedCapability?.skills || []);
  const matched = [];
  let boost = 0;
  for (const key of required) {
    const row = skillMap.get(key);
    if (!row) continue;
    matched.push(row.name);
    // rank 1 → +12, rank 5 → +4; level adds up to +3
    boost += Math.max(4, 14 - row.rank * 2) + Math.min(3, Math.floor(row.level / 2));
  }
  const reasons = matched.length ? [`skills_match:${matched.length}`] : [];
  return { boost, matched, reasons };
}

/**
 * Score business domain overlap.
 */
function scoreBusinessDomains(verifiedCapability, requiredDomains = []) {
  const required = (requiredDomains || []).map(normalizeKey).filter(Boolean);
  if (!required.length) return { boost: 0, matched: [], reasons: [] };

  const domainMap = buildDomainRankMap(verifiedCapability?.businessDomains || []);
  const matched = [];
  let boost = 0;
  for (const key of required) {
    const row = domainMap.get(key);
    if (!row) continue;
    matched.push(row.name);
    boost += Math.max(3, 12 - row.rank * 2);
  }
  const reasons = matched.length ? [`domain_match:${matched.length}`] : [];
  return { boost, matched, reasons };
}

/**
 * Infer required skills/domains from project role key (lightweight heuristic).
 */
function inferRequirementsFromProjectRole(projectRoleKey) {
  const key = normalizeKey(projectRoleKey).replace(/_/g, ' ');
  const skills = [];
  const domains = [];
  if (key.includes('backend')) skills.push('java', 'spring', 'node.js', 'postgresql');
  if (key.includes('frontend')) skills.push('react', 'typescript', 'javascript');
  if (key.includes('fullstack')) skills.push('react', 'node.js', 'typescript');
  if (key.includes('mobile')) skills.push('react', 'javascript');
  if (key.includes('qa')) skills.push('manual testing', 'selenium', 'api testing');
  if (key.includes('devops')) skills.push('docker', 'kubernetes', 'aws', 'ci/cd');
  return { skills: [...new Set(skills)], domains };
}

function scoreVerifiedCapability({ verifiedCapability, projectRoleKey, requiredSkills, requiredDomains }) {
  if (!verifiedCapability || verifiedCapability.verificationStatus !== 'verified') {
    return { boost: 0, skillMatch: { boost: 0, matched: [] }, domainMatch: { boost: 0, matched: [] }, reasons: [] };
  }
  const inferred = inferRequirementsFromProjectRole(projectRoleKey);
  const skillReq = (requiredSkills && requiredSkills.length ? requiredSkills : inferred.skills).map(normalizeKey);
  const domainReq = (requiredDomains && requiredDomains.length ? requiredDomains : inferred.domains).map(normalizeKey);

  const skillMatch = scoreCapabilitySkills(verifiedCapability, skillReq);
  const domainMatch = scoreBusinessDomains(verifiedCapability, domainReq);
  let seniorityBoost = 0;
  const band = String(verifiedCapability.seniorityBand || '').trim();
  if (band === 'senior' || band === 'lead' || band === 'principal') seniorityBoost = 5;
  else if (band === 'mid') seniorityBoost = 2;

  const reasons = [...skillMatch.reasons, ...domainMatch.reasons];
  if (seniorityBoost) reasons.push(`seniority_${band}`);

  return {
    boost: skillMatch.boost + domainMatch.boost + seniorityBoost,
    skillMatch,
    domainMatch,
    reasons,
  };
}

module.exports = {
  scoreCapabilitySkills,
  scoreBusinessDomains,
  scoreVerifiedCapability,
  inferRequirementsFromProjectRole,
  buildSkillRankMap,
  buildDomainRankMap,
};
