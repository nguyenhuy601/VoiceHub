/**
 * LLM propose staffing + enrich ranking rationales for AI Resource Planning.
 * Pure parse/validate helpers are unit-testable without Ollama.
 */

const {
  resolveWhitelistSkill,
  isKnownSkill,
  normalizeRoleKey,
  isKnownProjectRole,
} = require('./requirementStaffingParse');
const { isRegistryEnabled } = require('../clients/skillRegistry.client');
const {
  generateJson,
  ollamaModel,
  isAiPlanningLlmEnabled,
  enrichTimeoutMs,
} = require('./ollamaClient');
const { selectLeavesForPrompt } = require('./aiPlanningPromptLeaves');
const { listFrExecutionLeaves } = require('./requirementFrLevel');
const {
  buildPoolByUserId,
  buildEnrichCompactFromRoles,
  hasEnrichEvidence,
  shrinkEnrichCompact,
  MAX_ENRICH_BYTES,
} = require('./aiPlanningEnrichContext');

const SCORE_DELTA_MAX = 5;
const MAX_FR_LEAVES_IN_PROMPT = 40;
const MAX_DESC_CHARS = 180;
const MAX_STAFFING_OBJECTIVE_CHARS = 200;
const MAX_STAFFING_NFR_CHARS = 100;
const MAX_RATIONALE_CHARS = 400;
const MAX_NFR_ROWS = 8;
const MAX_NFR_REQ_CHARS = 200;
const MAX_TECH_ROWS = 15;
const MAX_SCOPE_ROWS = 6;
const MAX_AC_CHARS = 120;
const MAX_REQ_SKILLS = 30;
const PROMPT_SLICE_WARN_BYTES = 12 * 1024;
const STAFFING_NUM_PREDICT = 384;
const ENRICH_NUM_PREDICT = 256;
const STAFFING_ROLES_NUM_PREDICT = 256;
const STAFFING_SKILLS_NUM_PREDICT = 256;
const MAX_LEAF_SKILL_HINTS = 24;

function isStaffingSplitEnabled() {
  const flag = String(process.env.AI_PLANNING_STAFFING_SPLIT ?? '1').trim().toLowerCase();
  return !['0', 'false', 'off', 'no'].includes(flag);
}

function compactPoolSummaryForPrompt(poolSummary) {
  if (!poolSummary || typeof poolSummary !== 'object') return null;
  return {
    headcount: poolSummary.headcount ?? 0,
    avgAvailablePct: poolSummary.avgAvailablePct ?? null,
    seniorityBands: poolSummary.seniorityBands || null,
    roleHeadcount: poolSummary.roleHeadcount || [],
  };
}

function aggregateLeafSuggestedSkills(pack) {
  const counts = new Map();
  for (const row of listFrExecutionLeaves(pack?.functionalRequirements || [])) {
    for (const skill of row.suggestedSkills || []) {
      const name = String(skill || '').trim();
      if (!name) continue;
      counts.set(name, (counts.get(name) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_LEAF_SKILL_HINTS)
    .map(([name, leafCount]) => ({ name, leafCount }));
}

function heuristicSkillsFromPack(pack) {
  const seen = new Set();
  const skills = [];
  const pushSkill = (nameRaw) => {
    const resolved = resolveWhitelistSkill(nameRaw) || String(nameRaw || '').trim();
    if (!resolved) return;
    if (!isKnownSkill(resolved) && !isRegistryEnabled()) return;
    const key = resolved.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    skills.push({ name: resolved, source: 'ai' });
  };
  for (const ref of pack?.requirementSkills || []) {
    pushSkill(skillNameFromRef(ref));
  }
  for (const tech of pack?.technology || []) {
    if (tech?.mandatory) pushSkill(tech.name);
  }
  return skills;
}

/**
 * @returns {{ partial: object|null, dropped: string[] }}
 */
function normalizeStaffingRolesPartial(raw) {
  const dropped = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { partial: null, dropped: ['invalid_shape'] };
  }
  const requiredRoles = [];
  const seenRoles = new Set();
  for (const item of Array.isArray(raw.requiredRoles) ? raw.requiredRoles : []) {
    const roleKey = normalizeRoleKey(typeof item === 'string' ? item : item?.roleKey);
    if (!roleKey || !isKnownProjectRole(roleKey)) {
      dropped.push(`role:${String(roleKey || item?.roleKey || '').slice(0, 64)}`);
      continue;
    }
    if (seenRoles.has(roleKey)) continue;
    seenRoles.add(roleKey);
    requiredRoles.push({
      roleKey,
      requiredCount: clampCount(item?.requiredCount ?? 1),
      source: 'ai',
    });
  }
  if (!requiredRoles.length) {
    return { partial: null, dropped: dropped.length ? dropped : ['empty_roles'] };
  }
  return {
    partial: {
      requiredRoles,
      estimatedHoursTotal: clampHours(raw.estimatedHoursTotal),
      rationale: String(raw.rationale || '')
        .trim()
        .slice(0, MAX_RATIONALE_CHARS),
    },
    dropped,
  };
}

/**
 * @returns {{ partial: object|null, dropped: string[] }}
 */
function normalizeStaffingSkillsPartial(raw) {
  const dropped = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { partial: null, dropped: ['invalid_shape'] };
  }
  const requiredSkills = [];
  const seenSkills = new Set();
  for (const item of Array.isArray(raw.requiredSkills) ? raw.requiredSkills : []) {
    const nameRaw = typeof item === 'string' ? item : item?.name;
    const resolved = resolveWhitelistSkill(nameRaw) || String(nameRaw || '').trim();
    if (!resolved) {
      dropped.push(`skill:${String(nameRaw || '').slice(0, 64)}`);
      continue;
    }
    if (!isKnownSkill(resolved) && !isRegistryEnabled()) {
      dropped.push(`skill:${String(nameRaw || '').slice(0, 64)}`);
      continue;
    }
    const key = resolved.toLowerCase();
    if (seenSkills.has(key)) continue;
    seenSkills.add(key);
    requiredSkills.push({ name: resolved, source: 'ai' });
  }
  if (!requiredSkills.length) {
    return { partial: null, dropped: dropped.length ? dropped : ['empty_skills'] };
  }
  return {
    partial: {
      requiredSkills,
      rationale: String(raw.rationale || '')
        .trim()
        .slice(0, MAX_RATIONALE_CHARS),
    },
    dropped,
  };
}

function mergeStaffingPhaseResults(rolesPhase, skillsPhase, pack, baseline) {
  const dropped = [...(rolesPhase?.dropped || []), ...(skillsPhase?.dropped || [])];
  const requiredRoles = rolesPhase?.partial?.requiredRoles || [];
  let requiredSkills = skillsPhase?.partial?.requiredSkills || [];
  if (!requiredSkills.length) {
    requiredSkills = heuristicSkillsFromPack(pack);
    if (requiredSkills.length) dropped.push('skills_heuristic_fallback');
  }
  if (!requiredRoles.length && !requiredSkills.length) {
    return { proposal: null, dropped };
  }
  const rationale = [rolesPhase?.partial?.rationale, skillsPhase?.partial?.rationale]
    .filter(Boolean)
    .join(' ')
    .trim()
    .slice(0, MAX_RATIONALE_CHARS);
  const hours =
    rolesPhase?.partial?.estimatedHoursTotal != null
      ? rolesPhase.partial.estimatedHoursTotal
      : baseline?.totalLeafHours != null
        ? clampHours(baseline.totalLeafHours)
        : null;
  return {
    proposal: {
      requiredSkills,
      requiredRoles,
      estimatedHoursTotal: hours,
      rationale,
    },
    dropped,
  };
}

function buildStaffingRolesPromptSlice(pack, opts = {}) {
  const overview = pack?.overview || {};
  const baseline = opts.baseline;
  const poolSummary = compactPoolSummaryForPrompt(opts.poolSummary);
  const leafSelection = selectLeavesForPrompt(pack?.functionalRequirements || [], MAX_FR_LEAVES_IN_PROMPT);

  const slice = {
    requirementName: overview.requirementName || '',
    projectObjective: String(overview.projectObjective || '').slice(0, MAX_STAFFING_OBJECTIVE_CHARS),
    deadline: toIsoDate(overview.deadline),
    priority: overview.priority || '',
    baselineStaffing: baseline
      ? {
          fteRoles: (baseline.fteRoles || []).map((r) => ({
            roleKey: r.roleKey,
            fteRequired: r.requiredCount,
            leafCount: r.leafCount,
            roleHours: r.roleHours,
          })),
          totalLeafHours: baseline.totalLeafHours ?? null,
          estimatedHoursTotal: baseline.rollup?.estimatedHoursTotal ?? null,
        }
      : null,
    orgPoolSummary: poolSummary,
    sliceMeta: {
      phase: 'roles',
      totalLeaves: leafSelection.totalLeaves,
      leavesOmittedCount: leafSelection.leavesOmittedCount,
    },
  };

  const byteLength = Buffer.byteLength(JSON.stringify(slice), 'utf8');
  slice.sliceMeta.byteLength = byteLength;
  return slice;
}

function buildStaffingSkillsPromptSlice(pack, opts = {}) {
  const overview = pack?.overview || {};
  const requirementSkills = (pack?.requirementSkills || [])
    .slice(0, MAX_REQ_SKILLS)
    .map((ref) => skillNameFromRef(ref))
    .filter(Boolean);
  const technology = [...(pack?.technology || [])]
    .sort((a, b) => Number(Boolean(b.mandatory)) - Number(Boolean(a.mandatory)))
    .slice(0, 8)
    .map((t) => ({
      name: String(t.name || '').slice(0, 64),
      mandatory: Boolean(t.mandatory),
    }));
  const scopeIn = (pack?.scope || [])
    .filter((s) => s.type === 'in')
    .slice(0, 3)
    .map((s) => String(s.description || '').slice(0, 120));
  const scopeOut = (pack?.scope || [])
    .filter((s) => s.type === 'out')
    .slice(0, 3)
    .map((s) => String(s.description || '').slice(0, 120));

  const slice = {
    requirementName: overview.requirementName || '',
    projectObjective: String(overview.projectObjective || '').slice(0, MAX_STAFFING_OBJECTIVE_CHARS),
    requirementSkills,
    technology,
    leafSuggestedSkills: aggregateLeafSuggestedSkills(pack),
    scope: { in: scopeIn, out: scopeOut },
    sliceMeta: { phase: 'skills' },
  };

  const byteLength = Buffer.byteLength(JSON.stringify(slice), 'utf8');
  slice.sliceMeta.byteLength = byteLength;
  return slice;
}

async function proposeStaffingRolesPhase(pack, opts = {}) {
  const slice = buildStaffingRolesPromptSlice(pack, opts);
  const prompt = [
    'You are a software staffing analyst. Propose FTE role headcount from baseline staffing and org pool hints.',
    'Return ONLY JSON: {"requiredRoles":[{"roleKey":"...","requiredCount":N}],"estimatedHoursTotal":number|null,"rationale":"..."}',
    'roleKey snake_case: frontend_developer, backend_developer, qa_engineer, devops_engineer, project_manager, business_analyst, product_owner, ui_ux_designer, fullstack_developer.',
    'requiredCount is FTE people, not leaf count. Anchor on baselineStaffing.fteRoles.',
    'When orgPoolSummary is present, do not exceed org capacity. roleHeadcount is a soft hint only.',
    'If sliceMeta.leavesOmittedCount > 0, baselineStaffing.totalLeafHours includes omitted leaves.',
    'Do not echo the input JSON.',
    'Input:',
    JSON.stringify(slice),
  ].join('\n');

  const result = await generateJson({
    prompt,
    temperature: 0.1,
    numPredict: STAFFING_ROLES_NUM_PREDICT,
  });
  if (result.skipped) {
    return { status: 'skipped', partial: null, model: result.model, error: result.error, dropped: [] };
  }
  if (!result.ok) {
    return { status: 'failed', partial: null, model: result.model, error: result.error, dropped: [] };
  }
  const { partial, dropped } = normalizeStaffingRolesPartial(result.data);
  if (!partial) {
    return {
      status: 'failed',
      partial: null,
      model: result.model,
      error: 'roles_invalid',
      dropped,
    };
  }
  return { status: 'ok', partial, model: result.model, dropped };
}

async function proposeStaffingSkillsPhase(pack, opts = {}) {
  const slice = buildStaffingSkillsPromptSlice(pack, opts);
  const prompt = [
    'You are a software staffing analyst. Propose required technical skills for this requirement.',
    'Return ONLY JSON: {"requiredSkills":["React","SQL",...],"rationale":"..."}',
    'Use known tech skills only. Prefer requirementSkills, mandatory technology, and leafSuggestedSkills.',
    'Do not invent unknown skills. Do not echo the input JSON.',
    'Input:',
    JSON.stringify(slice),
  ].join('\n');

  const result = await generateJson({
    prompt,
    temperature: 0.1,
    numPredict: STAFFING_SKILLS_NUM_PREDICT,
  });
  if (result.skipped) {
    return { status: 'skipped', partial: null, model: result.model, error: result.error, dropped: [] };
  }
  if (!result.ok) {
    return { status: 'failed', partial: null, model: result.model, error: result.error, dropped: [] };
  }
  const { partial, dropped } = normalizeStaffingSkillsPartial(result.data);
  if (!partial) {
    return {
      status: 'failed',
      partial: null,
      model: result.model,
      error: 'skills_invalid',
      dropped,
    };
  }
  return { status: 'ok', partial, model: result.model, dropped };
}

async function proposeStaffingFromPackSplit(pack, opts = {}) {
  const rolesPhase = await proposeStaffingRolesPhase(pack, opts);
  if (rolesPhase.status === 'skipped') {
    return { status: 'skipped', proposal: null, model: rolesPhase.model, error: rolesPhase.error };
  }
  if (rolesPhase.status === 'failed') {
    return {
      status: 'failed',
      proposal: null,
      model: rolesPhase.model,
      error: rolesPhase.error || 'roles_failed',
      dropped: rolesPhase.dropped || [],
      phases: { roles: rolesPhase, skills: null },
    };
  }

  const skillsPhase = await proposeStaffingSkillsPhase(pack, opts);
  const skillsFailed = skillsPhase.status === 'failed';
  const { proposal, dropped } = mergeStaffingPhaseResults(
    rolesPhase,
    skillsPhase.status === 'ok' ? skillsPhase : { partial: null, dropped: skillsPhase.dropped || [] },
    pack,
    opts.baseline
  );

  if (!proposal) {
    return {
      status: 'failed',
      proposal: null,
      model: rolesPhase.model || skillsPhase.model,
      error: skillsFailed ? skillsPhase.error || 'skills_failed' : 'proposal_invalid',
      dropped,
      phases: { roles: rolesPhase, skills: skillsPhase },
    };
  }

  return {
    status: 'proposed',
    proposal,
    model: rolesPhase.model || skillsPhase.model,
    dropped,
    phases: { roles: rolesPhase, skills: skillsPhase },
    skillsFallback: skillsFailed || skillsPhase.status === 'skipped',
    error: skillsFailed ? skillsPhase.error : null,
  };
}

function toIsoDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

function skillNameFromRef(ref) {
  return String(ref?.skillNameSnapshot || ref?.name || ref?.rawInput || '').trim();
}

function clampScoreDelta(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-SCORE_DELTA_MAX, Math.min(SCORE_DELTA_MAX, Math.round(n)));
}

function clampHours(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(Math.round(n), 100000);
}

function clampCount(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(Math.round(n), 50);
}

/**
 * Validate and normalize LLM staffing proposal JSON.
 * @returns {{ proposal: object|null, dropped: string[] }}
 */
function normalizeStaffingProposal(raw) {
  const dropped = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { proposal: null, dropped: ['invalid_shape'] };
  }

  const requiredSkills = [];
  const seenSkills = new Set();
  for (const item of Array.isArray(raw.requiredSkills) ? raw.requiredSkills : []) {
    const nameRaw = typeof item === 'string' ? item : item?.name;
    const resolved = resolveWhitelistSkill(nameRaw) || String(nameRaw || '').trim();
    if (!resolved) {
      dropped.push(`skill:${String(nameRaw || '').slice(0, 64)}`);
      continue;
    }
    if (!isKnownSkill(resolved) && !isRegistryEnabled()) {
      dropped.push(`skill:${String(nameRaw || '').slice(0, 64)}`);
      continue;
    }
    const key = resolved.toLowerCase();
    if (seenSkills.has(key)) continue;
    seenSkills.add(key);
    requiredSkills.push({ name: resolved, source: 'ai' });
  }

  const requiredRoles = [];
  const seenRoles = new Set();
  for (const item of Array.isArray(raw.requiredRoles) ? raw.requiredRoles : []) {
    const roleKey = normalizeRoleKey(typeof item === 'string' ? item : item?.roleKey);
    if (!roleKey || !isKnownProjectRole(roleKey)) {
      dropped.push(`role:${String(roleKey || item?.roleKey || '').slice(0, 64)}`);
      continue;
    }
    if (seenRoles.has(roleKey)) continue;
    seenRoles.add(roleKey);
    requiredRoles.push({
      roleKey,
      requiredCount: clampCount(item?.requiredCount ?? 1),
      source: 'ai',
    });
  }

  if (!requiredRoles.length && !requiredSkills.length) {
    return { proposal: null, dropped: dropped.length ? dropped : ['empty_proposal'] };
  }

  const hours = clampHours(raw.estimatedHoursTotal);
  const rationale = String(raw.rationale || '')
    .trim()
    .slice(0, MAX_RATIONALE_CHARS);

  return {
    proposal: {
      requiredSkills,
      requiredRoles,
      estimatedHoursTotal: hours,
      rationale,
    },
    dropped,
  };
}

/**
 * Apply enrich rows onto heuristic suggestions (mutates copies).
 * scoreDelta is forced to 0 when there is no enrich evidence on the suggestion/pool row.
 */
function applyEnrichmentToRoles(roles, enrichByRole, options = {}) {
  const poolByUserId = options.poolByUserId || new Map();
  const list = Array.isArray(roles) ? roles : [];
  return list.map((role) => {
    const roleKey = String(role.roleKey || '')
      .trim()
      .toLowerCase();
    const enrichMap = enrichByRole?.get(roleKey) || new Map();
    const suggestions = (role.suggestions || []).map((s) => {
      const userId = String(s.userId || '').trim();
      const poolItem = poolByUserId.get(userId);
      const row = enrichMap.get(userId);
      const jobTitle = s.jobTitle || poolItem?.jobTitle || undefined;
      const seniorityBand =
        s.seniorityBand || poolItem?.capability?.seniorityBand || undefined;
      if (!row) {
        return {
          ...s,
          jobTitle,
          seniorityBand,
        };
      }
      let scoreDelta = clampScoreDelta(row.scoreDelta);
      if (!hasEnrichEvidence({ ...s, jobTitle }, poolItem, roleKey)) {
        scoreDelta = 0;
      }
      const nextScore = Math.max(0, Math.min(100, Math.round(Number(s.score) || 0) + scoreDelta));
      return {
        ...s,
        jobTitle,
        seniorityBand,
        score: nextScore,
        scoreDelta: scoreDelta || undefined,
        rationale: String(row.rationale || '')
          .trim()
          .slice(0, MAX_RATIONALE_CHARS) || undefined,
      };
    });
    suggestions.sort((a, b) => b.score - a.score || String(a.displayName).localeCompare(String(b.displayName)));
    return { ...role, suggestions };
  });
}

function normalizeEnrichPayload(raw) {
  const byRole = new Map();
  const rows = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.enrichments)
      ? raw.enrichments
      : Array.isArray(raw?.roles)
        ? raw.roles.flatMap((r) =>
            (r.suggestions || []).map((s) => ({
              roleKey: r.roleKey,
              userId: s.userId,
              rationale: s.rationale,
              scoreDelta: s.scoreDelta,
            }))
          )
        : [];

  for (const row of rows) {
    const roleKey = normalizeRoleKey(row.roleKey);
    const userId = String(row.userId || '').trim();
    if (!roleKey || !userId) continue;
    if (!byRole.has(roleKey)) byRole.set(roleKey, new Map());
    byRole.get(roleKey).set(userId, {
      rationale: row.rationale,
      scoreDelta: row.scoreDelta,
    });
  }
  return byRole;
}

function buildPackPromptSlice(pack, opts = {}) {
  const overview = pack?.overview || {};
  const baseline = opts.baseline;
  const poolSummary = opts.poolSummary || null;
  const registrySkills = Array.isArray(opts.registrySkills) ? opts.registrySkills : [];
  const compactForStaffing = Boolean(opts.compactForStaffing);

  const leafSelection = selectLeavesForPrompt(
    pack?.functionalRequirements || [],
    MAX_FR_LEAVES_IN_PROMPT
  );
  const leaves = leafSelection.leaves.map((r) => {
    const row = {
      id: r.externalId,
      name: String(r.name || '').slice(0, compactForStaffing ? 80 : 120),
      estimateHours: r.estimateHours ?? null,
      suggestedSkills: r.suggestedSkills || [],
      suggestedRoleKey: r.suggestedRoleKey || '',
    };
    if (compactForStaffing) {
      const priority = String(r.priority || '').trim();
      if (priority) row.priority = priority.slice(0, 16);
      return row;
    }
    return {
      ...row,
      description: String(r.description || '').slice(0, MAX_DESC_CHARS),
      acceptanceCriteria: String(r.acceptanceCriteria || '').slice(0, MAX_AC_CHARS),
      priority: String(r.priority || '').slice(0, 32),
    };
  });

  const nonFunctionalRequirements = (pack?.nonFunctionalRequirements || [])
    .slice(0, compactForStaffing ? 4 : MAX_NFR_ROWS)
    .map((n) => {
      if (compactForStaffing) {
        return {
          category: String(n.category || '').slice(0, 48),
          requirement: String(n.requirement || '').slice(0, MAX_STAFFING_NFR_CHARS),
        };
      }
      return {
        category: String(n.category || '').slice(0, 64),
        requirement: String(n.requirement || '').slice(0, MAX_NFR_REQ_CHARS),
        target: String(n.target || '').slice(0, 120),
        priority: String(n.priority || '').slice(0, 32),
      };
    });

  const technology = [...(pack?.technology || [])]
    .sort((a, b) => Number(Boolean(b.mandatory)) - Number(Boolean(a.mandatory)))
    .slice(0, compactForStaffing ? 8 : MAX_TECH_ROWS)
    .map((t) => {
      if (compactForStaffing) {
        return {
          name: String(t.name || '').slice(0, 64),
          mandatory: Boolean(t.mandatory),
        };
      }
      return {
        category: String(t.category || '').slice(0, 64),
        name: String(t.name || '').slice(0, 64),
        version: String(t.version || '').slice(0, 32),
        mandatory: Boolean(t.mandatory),
      };
    });

  const scopeIn = (pack?.scope || [])
    .filter((s) => s.type === 'in')
    .slice(0, compactForStaffing ? 3 : MAX_SCOPE_ROWS)
    .map((s) => String(s.description || '').slice(0, compactForStaffing ? 120 : 200));
  const scopeOut = (pack?.scope || [])
    .filter((s) => s.type === 'out')
    .slice(0, compactForStaffing ? 3 : MAX_SCOPE_ROWS)
    .map((s) => String(s.description || '').slice(0, compactForStaffing ? 120 : 200));

  const requirementSkills = compactForStaffing
    ? (pack?.requirementSkills || [])
        .slice(0, MAX_REQ_SKILLS)
        .map((ref) => skillNameFromRef(ref))
        .filter(Boolean)
    : (pack?.requirementSkills || [])
        .slice(0, MAX_REQ_SKILLS)
        .map((ref) => ({
          skillId: ref.skillId ? String(ref.skillId) : null,
          name: skillNameFromRef(ref),
          requiredLevel: ref.requiredLevel ?? null,
          importance: String(ref.importance || '').slice(0, 32),
        }))
        .filter((ref) => ref.name || ref.skillId);

  const registrySkillHints =
    compactForStaffing || !registrySkills.length
      ? []
      : registrySkills
          .slice(0, MAX_REQ_SKILLS)
          .map((skill) => ({
            skillId: skill.skillId ? String(skill.skillId) : skill._id ? String(skill._id) : null,
            name: String(skill.normalizedName || skill.name || '').slice(0, 64),
            status: String(skill.status || skill.registryStatus || '').slice(0, 16),
          }))
          .filter((skill) => skill.name || skill.skillId);

  const slice = {
    requirementName: overview.requirementName || '',
    projectObjective: String(overview.projectObjective || '').slice(
      0,
      compactForStaffing ? MAX_STAFFING_OBJECTIVE_CHARS : 500
    ),
    ...(compactForStaffing
      ? {}
      : {
          businessScope: String(overview.businessScope || '').slice(0, 400),
          platform: overview.platform || [],
        }),
    deadline: toIsoDate(overview.deadline),
    priority: overview.priority || '',
    ...(compactForStaffing
      ? {}
      : {
          constraints: {
            budget: overview.budget ?? null,
            budgetCurrency: overview.budgetCurrency || '',
            expectedUsers: overview.expectedUsers || '',
            startDate: toIsoDate(overview.startDate),
            deadline: toIsoDate(overview.deadline),
          },
        }),
    scope: { in: scopeIn, out: scopeOut },
    nonFunctionalRequirements,
    technology,
    requirementSkills,
    ...(registrySkillHints.length ? { registrySkillHints } : {}),
    ...(poolSummary ? { orgPoolSummary: poolSummary } : {}),
    leaves,
    sliceMeta: {
      leavesInPrompt: leaves.length,
      leavesOmittedCount: leafSelection.leavesOmittedCount,
      totalLeaves: leafSelection.totalLeaves,
      compactForStaffing,
    },
    ...(compactForStaffing || !baseline
      ? {}
      : {
          currentStaffing: {
            requiredSkills: (pack?.staffingPlan?.requiredSkills || []).map((s) => s.name || s),
            requiredRoles: pack?.staffingPlan?.requiredRoles || [],
            estimatedHoursTotal: pack?.staffingPlan?.estimatedHoursTotal ?? null,
          },
        }),
    baselineStaffing: baseline
      ? {
          fteRoles: (baseline.fteRoles || []).map((r) => ({
            roleKey: r.roleKey,
            fteRequired: r.requiredCount,
            leafCount: r.leafCount,
            roleHours: r.roleHours,
          })),
          totalLeafHours: baseline.totalLeafHours ?? null,
          estimatedHoursTotal: baseline.rollup?.estimatedHoursTotal ?? null,
        }
      : null,
  };

  const byteLength = Buffer.byteLength(JSON.stringify(slice), 'utf8');
  slice.sliceMeta.byteLength = byteLength;
  if (byteLength > PROMPT_SLICE_WARN_BYTES) {
    slice.sliceMeta.warn = 'prompt_slice_large';
  }

  return slice;
}

async function proposeStaffingFromPackSingle(pack, opts = {}) {
  const slice = buildPackPromptSlice(pack, { ...opts, compactForStaffing: true });
  const prompt = [
    'You are a software staffing analyst. Propose a resource staffing plan from the requirement JSON.',
    'Return ONLY JSON object with keys:',
    'requiredSkills: string[] (from known tech skills),',
    'requiredRoles: [{roleKey, requiredCount}],',
    'estimatedHoursTotal: number|null,',
    'rationale: short Vietnamese or English string.',
    'roleKey must be snake_case project roles like frontend_developer, backend_developer, qa_engineer, devops_engineer, project_manager, business_analyst, product_owner, ui_ux_designer, fullstack_developer.',
    'Do not invent unknown skills. Prefer requirementSkills, mandatory technology, and skills on leaves when present.',
    'Do not echo or repeat the input JSON.',
    'requiredCount is FTE headcount (people), not leaf count. Use baselineStaffing.fteRoles as anchor when present.',
    'When orgPoolSummary is present, do not propose total FTE that clearly exceeds org capacity (headcount, avgAvailablePct, seniorityBands).',
    'orgPoolSummary.roleHeadcount estimates people by job title per project role — a soft hint only, not a hard cap. When roleHeadcount shows low count for a role, do not propose high FTE for that role unless leaves strongly require it.',
    'If sliceMeta.leavesOmittedCount > 0, baselineStaffing.totalLeafHours includes hours on omitted leaves — align estimatedHoursTotal with that total.',
    'Input:',
    JSON.stringify(slice),
  ].join('\n');

  const result = await generateJson({
    prompt,
    temperature: 0.1,
    numPredict: STAFFING_NUM_PREDICT,
  });
  if (result.skipped) {
    return { status: 'skipped', proposal: null, model: result.model, error: result.error };
  }
  if (!result.ok) {
    return { status: 'failed', proposal: null, model: result.model, error: result.error };
  }
  const { proposal, dropped } = normalizeStaffingProposal(result.data);
  if (!proposal) {
    return {
      status: 'failed',
      proposal: null,
      model: result.model,
      error: 'proposal_invalid',
      dropped,
    };
  }
  return { status: 'proposed', proposal, model: result.model, dropped };
}

async function proposeStaffingFromPack(pack, opts = {}) {
  if (!isAiPlanningLlmEnabled()) {
    return { status: 'skipped', proposal: null, model: ollamaModel(), error: 'disabled' };
  }
  if (isStaffingSplitEnabled()) {
    return proposeStaffingFromPackSplit(pack, opts);
  }
  return proposeStaffingFromPackSingle(pack, opts);
}

async function enrichRankingRationales(overlayRoles, options = {}) {
  if (!isAiPlanningLlmEnabled()) {
    return { status: 'skipped', roles: overlayRoles, model: ollamaModel(), error: 'disabled' };
  }
  const poolItems = Array.isArray(options.poolItems) ? options.poolItems : [];
  const poolByUserId = buildPoolByUserId(poolItems);
  const compact = shrinkEnrichCompact(buildEnrichCompactFromRoles(overlayRoles, poolItems));

  const prompt = [
    'You enrich staffing recommendations. For each suggestion, add a short rationale (1 sentence)',
    'and optional scoreDelta integer from -5 to 5 (prefer 0 unless strong evidence).',
    'Use jobTitle, seniorityBand, yearsExperience, and verified projectExperiences only for rationale.',
    'scoreDelta non-zero only with clear evidence from matchedSkills, position match, or project experience overlap.',
    'Return ONLY JSON: {"enrichments":[{"roleKey":"...","userId":"...","rationale":"...","scoreDelta":0}]}',
    'Do not invent users. Only use userIds from input.',
    'Input:',
    JSON.stringify(compact),
  ].join('\n');

  const result = await generateJson({
    prompt,
    temperature: 0.2,
    timeoutMs: enrichTimeoutMs(),
    numPredict: ENRICH_NUM_PREDICT,
  });
  if (result.skipped) {
    return { status: 'skipped', roles: overlayRoles, model: result.model, error: result.error };
  }
  if (!result.ok) {
    return { status: 'failed', roles: overlayRoles, model: result.model, error: result.error };
  }
  const byRole = normalizeEnrichPayload(result.data);
  const roles = applyEnrichmentToRoles(overlayRoles, byRole, { poolByUserId });
  return { status: 'ready', roles, model: result.model };
}

module.exports = {
  SCORE_DELTA_MAX,
  MAX_FR_LEAVES_IN_PROMPT,
  PROMPT_SLICE_WARN_BYTES,
  MAX_ENRICH_BYTES,
  STAFFING_NUM_PREDICT,
  ENRICH_NUM_PREDICT,
  normalizeStaffingProposal,
  normalizeStaffingRolesPartial,
  normalizeStaffingSkillsPartial,
  mergeStaffingPhaseResults,
  normalizeEnrichPayload,
  applyEnrichmentToRoles,
  clampScoreDelta,
  buildPackPromptSlice,
  buildStaffingRolesPromptSlice,
  buildStaffingSkillsPromptSlice,
  isStaffingSplitEnabled,
  proposeStaffingFromPack,
  enrichRankingRationales,
  selectLeavesForPrompt,
};
