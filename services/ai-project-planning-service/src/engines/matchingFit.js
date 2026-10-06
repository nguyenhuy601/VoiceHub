/**
 * Fit layer — role / skill-critical / domain / seniority (NOTE-2.3a).
 * Soft history+domain bonus capped ≤ 0.1 (RULE-HOW-02).
 * Self-contained (no require of employeeMatching — avoid circular deps).
 */

const { normalizeRoleKey } = require('./roleKey');

function clamp01(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, Math.round(n * 1000) / 1000));
}

function skillNameMatch(a, b) {
  const x = String(a || '')
    .toLowerCase()
    .trim();
  const y = String(b || '')
    .toLowerCase()
    .trim();
  if (!x || !y) return false;
  if (x === y) return true;
  return x.includes(y) || y.includes(x);
}

function skillsFromItem(item) {
  if (Array.isArray(item?.skills) && item.skills.length) return item.skills;
  return Array.isArray(item?.capability?.skills) ? item.capability.skills : [];
}

function canonicalSkillIds(list = []) {
  return [
    ...new Set(
      (list || [])
        .map((id) => String(id || '').trim().toUpperCase())
        .filter((id) => id && id !== 'SK-UNMAPPED')
    ),
  ];
}

function skillCoverageContribution(item, needNames, requiredSkillIds = []) {
  const reqIds = canonicalSkillIds(requiredSkillIds);
  const empIds = new Set(canonicalSkillIds(item.skillCanonicalIds || []));
  const skills = skillsFromItem(item);
  if (reqIds.length && empIds.size) {
    const hits = reqIds.filter((id) => empIds.has(id)).length;
    return 0.3 * (hits / reqIds.length);
  }
  if (!needNames?.size) return 0;
  let hits = 0;
  for (const need of needNames) {
    const matched = skills.some((skill) => {
      const name = String(typeof skill === 'string' ? skill : skill?.name || '').toLowerCase();
      return skillNameMatch(name, need);
    });
    if (matched) hits += 1;
  }
  return 0.3 * (hits / needNames.size);
}

function historyOverlapBonus(item, task, needSkills = new Set()) {
  let roleHit = false;
  let domainHit = false;
  const roleKey = normalizeRoleKey(task?.suggestedRoleKey);
  for (const row of item?.history || []) {
    const historyRole = normalizeRoleKey(row?.role || row?.projectRole);
    roleHit ||= Boolean(
      roleKey && historyRole && (roleKey.includes(historyRole) || historyRole.includes(roleKey))
    );
    const domain = String(row?.domain || row?.businessDomain || '')
      .toLowerCase()
      .trim();
    if (domain && needSkills.size) {
      domainHit ||= [...needSkills].some((skill) => domain.includes(skill) || skill.includes(domain));
    }
  }
  return Math.min(0.1, (roleHit ? 0.06 : 0) + (domainHit ? 0.04 : 0));
}

function requiredSkills(container, task) {
  const skills = new Set(
    (container?.planning?.skills || [])
      .map((skill) => String(typeof skill === 'string' ? skill : skill?.name || '').toLowerCase())
      .filter(Boolean)
  );
  for (const id of task?.sourceCapabilityIds || []) {
    const capability = (container?.analyses?.capability?.items || []).find(
      (item) => item.capabilityId === id
    );
    for (const skill of capability?.requiredSkills || []) {
      const name = String(typeof skill === 'string' ? skill : skill?.name || '').toLowerCase();
      if (name) skills.add(name);
    }
  }
  return skills;
}

function roleFitContribution(item, task) {
  const roleKey = normalizeRoleKey(task?.suggestedRoleKey);
  if (!roleKey) return 0.1;
  const itemRoles = [item.projectRoleKey, item.jobTitle, ...(item.inferredRoleKeys || [])]
    .map(normalizeRoleKey)
    .filter(Boolean);
  if (itemRoles.some((role) => role.includes(roleKey) || roleKey.includes(role))) return 0.35;
  return 0;
}

function criticalSkillBonus(item, criticalSkillIds = []) {
  const req = canonicalSkillIds(criticalSkillIds);
  if (!req.length) return 0;
  const empIds = new Set(canonicalSkillIds(item.skillCanonicalIds || []));
  if (!empIds.size) {
    const skills = skillsFromItem(item);
    let hits = 0;
    for (const need of req) {
      if (skills.some((s) => skillNameMatch(typeof s === 'string' ? s : s?.name, need))) hits += 1;
    }
    return 0.12 * (hits / req.length);
  }
  const hits = req.filter((id) => empIds.has(id)).length;
  return 0.2 * (hits / req.length);
}

function domainFitContribution(item, domainTokens = []) {
  if (!domainTokens.length) return 0;
  const blob = [
    item.primaryDomain,
    ...(item.capability?.businessDomains || []),
    ...(item.history || []).map((h) => h.domain || h.businessDomain),
  ]
    .map((x) => String(x || '').toLowerCase())
    .join(' ');
  if (!blob.trim()) return 0;
  let hits = 0;
  for (const token of domainTokens) {
    const t = String(token || '').toLowerCase();
    if (t && blob.includes(t)) hits += 1;
  }
  return Math.min(0.04, 0.04 * (hits / domainTokens.length));
}

function seniorityFitContribution(item, task, container) {
  const complexity = (task.sourceCapabilityIds || [])
    .map((id) =>
      (container?.analyses?.capability?.items || []).find((c) => c.capabilityId === id)
    )
    .find(Boolean)?.complexity;
  const level = Number(item.seniorityLevel || item.level || 0);
  if (complexity === 'high' && level >= 4) return 0.1;
  if (complexity === 'high' && level >= 3) return 0.05;
  if (complexity === 'medium' && level >= 3) return 0.04;
  if (level >= 2) return 0.02;
  return 0;
}

/** Soft area ↔ role/domain affinity (≤0.05). */
function areaAffinityContribution(item, task) {
  const area = String(task?.area || '').toLowerCase().trim();
  if (!area) return 0;
  const blob = [
    item.jobTitle,
    item.primaryDomain,
    item.projectRoleKey,
    ...(item.inferredRoleKeys || []),
  ]
    .map((x) => String(x || '').toLowerCase())
    .join(' ');
  if (!blob.trim()) return 0;
  const patterns = {
    frontend: /front|react|vue|angular|ui|ux|css/,
    backend: /back|api|node|java|server|\.net|spring/,
    qa: /qa|test|quality|sdet/,
    design: /design|ux|figma|ui/,
    infrastructure: /devops|sre|infra|k8s|cloud|ops/,
    infra: /devops|sre|infra|k8s|cloud|ops/,
    devops: /devops|sre|infra|k8s|cloud|ops/,
    database: /dba|sql|data|database/,
    auth: /auth|security|iam/,
    security: /security|iam|auth/,
  };
  const re = patterns[area];
  if (re && re.test(blob)) return 0.05;
  return 0;
}

/**
 * @returns {number} fitScore in [0,1]
 */
function computeFitScore({
  item,
  task,
  container = {},
  planningHints = null,
  criticalSkillIds = null,
  domainTokens = null,
} = {}) {
  const critIds =
    criticalSkillIds ||
    planningHints?.criticalSkillIds ||
    container?.merged?.requiredSkillIds ||
    [];
  const domains = domainTokens || planningHints?.domainTokens || [];
  const needs = requiredSkills(container, task);

  let score = 0.15;
  score += roleFitContribution(item, task);
  score += skillCoverageContribution(item, needs, critIds);
  score += criticalSkillBonus(item, critIds);
  score += seniorityFitContribution(item, task, container);
  score += areaAffinityContribution(item, task);

  const historySoft = historyOverlapBonus(item, task, needs);
  const domainSoft = domainFitContribution(item, domains);
  score += Math.min(0.1, historySoft + domainSoft);

  return clamp01(score);
}

module.exports = {
  computeFitScore,
  roleFitContribution,
  criticalSkillBonus,
  domainFitContribution,
  seniorityFitContribution,
  areaAffinityContribution,
  skillCoverageContribution,
  historyOverlapBonus,
};
