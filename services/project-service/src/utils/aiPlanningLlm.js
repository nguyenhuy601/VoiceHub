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
const { generateJson, ollamaModel, isAiPlanningLlmEnabled } = require('./ollamaClient');

const SCORE_DELTA_MAX = 5;
const MAX_FR_LEAVES_IN_PROMPT = 40;
const MAX_DESC_CHARS = 180;
const MAX_RATIONALE_CHARS = 400;

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
    const resolved = resolveWhitelistSkill(nameRaw);
    if (!resolved || !isKnownSkill(resolved)) {
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
 */
function applyEnrichmentToRoles(roles, enrichByRole) {
  const list = Array.isArray(roles) ? roles : [];
  return list.map((role) => {
    const roleKey = String(role.roleKey || '')
      .trim()
      .toLowerCase();
    const enrichMap = enrichByRole?.get(roleKey) || new Map();
    const suggestions = (role.suggestions || []).map((s) => {
      const row = enrichMap.get(String(s.userId || ''));
      if (!row) return { ...s };
      const scoreDelta = clampScoreDelta(row.scoreDelta);
      const nextScore = Math.max(0, Math.min(100, Math.round(Number(s.score) || 0) + scoreDelta));
      return {
        ...s,
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

function buildPackPromptSlice(pack) {
  const overview = pack?.overview || {};
  const leaves = (pack?.functionalRequirements || [])
    .filter((r) => r.level === 'Requirement')
    .slice(0, MAX_FR_LEAVES_IN_PROMPT)
    .map((r) => ({
      id: r.externalId,
      name: String(r.name || '').slice(0, 120),
      description: String(r.description || '').slice(0, MAX_DESC_CHARS),
      estimateHours: r.estimateHours ?? null,
      suggestedSkills: r.suggestedSkills || [],
      suggestedRoleKey: r.suggestedRoleKey || '',
    }));
  const nfrCats = [
    ...new Set(
      (pack?.nonFunctionalRequirements || [])
        .map((n) => String(n.category || '').trim())
        .filter(Boolean)
    ),
  ].slice(0, 12);

  return {
    requirementName: overview.requirementName || '',
    projectObjective: String(overview.projectObjective || '').slice(0, 500),
    businessScope: String(overview.businessScope || '').slice(0, 400),
    platform: overview.platform || [],
    deadline: overview.deadline || null,
    priority: overview.priority || '',
    leaves,
    nfrCategories: nfrCats,
    currentStaffing: {
      requiredSkills: (pack?.staffingPlan?.requiredSkills || []).map((s) => s.name || s),
      requiredRoles: pack?.staffingPlan?.requiredRoles || [],
      estimatedHoursTotal: pack?.staffingPlan?.estimatedHoursTotal ?? null,
    },
  };
}

async function proposeStaffingFromPack(pack) {
  if (!isAiPlanningLlmEnabled()) {
    return { status: 'skipped', proposal: null, model: ollamaModel(), error: 'disabled' };
  }
  const slice = buildPackPromptSlice(pack);
  const prompt = [
    'You are a software staffing analyst. Propose a resource staffing plan from the requirement JSON.',
    'Return ONLY JSON object with keys:',
    'requiredSkills: string[] (from known tech skills),',
    'requiredRoles: [{roleKey, requiredCount}],',
    'estimatedHoursTotal: number|null,',
    'rationale: short Vietnamese or English string.',
    'roleKey must be snake_case project roles like frontend_developer, backend_developer, qa_engineer, devops_engineer, project_manager, business_analyst, product_owner, ui_ux_designer, fullstack_developer.',
    'Do not invent unknown skills. Prefer skills already listed on leaves when present.',
    'Input:',
    JSON.stringify(slice),
  ].join('\n');

  const result = await generateJson({ prompt, temperature: 0.1 });
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

async function enrichRankingRationales(overlayRoles) {
  if (!isAiPlanningLlmEnabled()) {
    return { status: 'skipped', roles: overlayRoles, model: ollamaModel(), error: 'disabled' };
  }
  const compact = (overlayRoles || []).map((role) => ({
    roleKey: role.roleKey,
    requiredCount: role.requiredCount,
    suggestions: (role.suggestions || []).slice(0, 5).map((s) => ({
      userId: s.userId,
      displayName: s.displayName,
      score: s.score,
      matchedSkills: s.matchedSkills || [],
      availableHours: s.availableHours,
      reasons: (s.reasons || []).slice(0, 6),
    })),
  }));

  const prompt = [
    'You enrich staffing recommendations. For each suggestion, add a short rationale (1 sentence)',
    'and optional scoreDelta integer from -5 to 5 (prefer 0 unless strong evidence).',
    'Return ONLY JSON: {"enrichments":[{"roleKey":"...","userId":"...","rationale":"...","scoreDelta":0}]}',
    'Do not invent users. Only use userIds from input.',
    'Input:',
    JSON.stringify(compact),
  ].join('\n');

  const result = await generateJson({ prompt, temperature: 0.2 });
  if (result.skipped) {
    return { status: 'skipped', roles: overlayRoles, model: result.model, error: result.error };
  }
  if (!result.ok) {
    return { status: 'failed', roles: overlayRoles, model: result.model, error: result.error };
  }
  const byRole = normalizeEnrichPayload(result.data);
  const roles = applyEnrichmentToRoles(overlayRoles, byRole);
  return { status: 'ready', roles, model: result.model };
}

module.exports = {
  SCORE_DELTA_MAX,
  normalizeStaffingProposal,
  normalizeEnrichPayload,
  applyEnrichmentToRoles,
  clampScoreDelta,
  buildPackPromptSlice,
  proposeStaffingFromPack,
  enrichRankingRationales,
};
