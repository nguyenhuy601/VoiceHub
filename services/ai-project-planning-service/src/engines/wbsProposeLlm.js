/**
 * WBS LLM propose — task leaves under backlog stories only.
 * RULE-L1/L2: no post-mutate; invalid parentStoryId/sourceFrIds/acRefs → fail + reason (no retry).
 * P0: no forced ≥1 task/story; FR/AC coverage is reported (success|partial), not invent-filled.
 */

const { generateJson, isLlmEnabled } = require('../runtime/ollamaGenerate');
const {
  isHowWbsLlmFlagOn,
  resolveWbsLlmNumPredict,
  resolveWbsLlmNumCtx,
  resolveWbsLlmTimeoutMs,
} = require('../contracts/howWbsLlmContract');
const { buildCtxPromptFragment, logHowCtx } = require('../orchestration/howProposalNodes');
const { backlogNodesAsTasks } = require('./backlogMap');

const AREA_ENUM = Object.freeze([
  'frontend',
  'backend',
  'qa',
  'design',
  'infra',
  'infrastructure',
]);

/** Required story fields for propose — full enough to decompose, capped for pathological dumps. */
const STORY_NAME_MAX = 240;
const STORY_DESC_MAX = 1200;
const STORY_AC_MAX = 24;
const STORY_AC_CHARS = 240;
const STORY_FR_MAX = 16;

/** P1: richer CTX for WBS propose (vs default HOW fragment). */
const WBS_CTX_MAX_ITEMS = 10;
const WBS_CTX_MAX_CHARS = 1400;

/** P2: quality fields — concrete deliverable + completion condition. */
const DELIVERABLE_MIN_LEN = 8;
const DONE_WHEN_MIN_LEN = 8;

function truncate(text, max) {
  const s = String(text || '').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

function normalizeRef(raw) {
  return String(raw || '').trim();
}

function storyWhitelist(backlog = {}) {
  return new Set(
    (Array.isArray(backlog.stories) ? backlog.stories : [])
      .map((s) => String(s?.id || '').trim())
      .filter(Boolean)
  );
}

function storyMapById(backlog = {}) {
  const map = new Map();
  for (const s of backlog.stories || []) {
    const id = normalizeRef(s?.id);
    if (id) map.set(id, s);
  }
  return map;
}

/** Prompt + accept share the same AC list so whitelist matches STORIES.ac. */
function storyAcList(story) {
  return (Array.isArray(story?.acRefs) ? story.acRefs : [])
    .slice(0, STORY_AC_MAX)
    .map((a) => truncate(a, STORY_AC_CHARS))
    .filter(Boolean);
}

function storyAcWhitelist(story) {
  return new Set(storyAcList(story));
}

/** Normalize AC for soft cite match (LLM often truncates / drops trailing punctuation). */
function normalizeAcKey(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/[.…]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Accept AC cite when exact or safe prefix/containment vs story whitelist.
 * Rejects invent: requires overlap with a real whitelist AC (min length guard).
 */
function acRefAllowed(received, whitelist) {
  const r = normalizeAcKey(received);
  if (!r || r.length < 4) return false;
  const list = whitelist instanceof Set ? [...whitelist] : Array.isArray(whitelist) ? whitelist : [];
  for (const w of list) {
    const n = normalizeAcKey(w);
    if (!n) continue;
    if (r === n) return true;
    if (n.startsWith(r) && r.length >= 8) return true;
    if (r.startsWith(n) && n.length >= 8) return true;
    if (n.includes(r) && r.length >= 12) return true;
  }
  return false;
}

function acCitationCoversWhitelist(whitelistAc, citedRawList) {
  const cited = Array.isArray(citedRawList) ? citedRawList : [];
  if (cited.some((c) => normalizeRef(c) === whitelistAc)) return true;
  return cited.some((c) => acRefAllowed(c, [whitelistAc]));
}

function storyFrWhitelist(story) {
  return new Set(
    (Array.isArray(story?.sourceFrIds) ? story.sourceFrIds : [])
      .slice(0, STORY_FR_MAX)
      .map((x) => normalizeRef(x))
      .filter(Boolean)
  );
}

/** Attach FR description from pack when story.description missing (required for decompose). */
function enrichStoriesWithPack(stories = [], pack = {}) {
  const frRows = Array.isArray(pack?.functionalRequirements)
    ? pack.functionalRequirements
    : Array.isArray(pack?.frList)
      ? pack.frList
      : [];
  const byFr = new Map();
  for (let i = 0; i < frRows.length; i += 1) {
    const row = frRows[i] || {};
    const id = normalizeRef(
      row.externalId || row.id || row.frId || row.key || `FR-${i + 1}`
    );
    if (!id) continue;
    const desc = [row.description, row.detail, row.summary]
      .map((p) => String(p || '').trim())
      .filter(Boolean)
      .join('\n');
    if (desc) byFr.set(id, desc);
  }
  return (Array.isArray(stories) ? stories : []).map((s) => {
    if (!s || s.description) return s;
    const frIds = Array.isArray(s.sourceFrIds) ? s.sourceFrIds : [];
    const desc = frIds
      .map((fid) => byFr.get(normalizeRef(fid)))
      .filter(Boolean)
      .join('\n---\n');
    if (!desc) return s;
    return { ...s, description: truncate(desc, STORY_DESC_MAX) };
  });
}

/**
 * Strict accept/reject — no rewrite of LLM fields.
 * Empty nodes[] is allowed (all stories may be unresolved).
 * @returns {{ ok: true, tasks: object[] } | { ok: false, errors: string[] }}
 */
function acceptWbsStoryTasks(raw, backlog = {}) {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, errors: ['not_object'] };
  }
  const list = Array.isArray(raw.nodes)
    ? raw.nodes
    : Array.isArray(raw.tasks)
      ? raw.tasks
      : null;
  if (!list) return { ok: false, errors: ['missing_nodes'] };

  const stories = storyWhitelist(backlog);
  const byId = storyMapById(backlog);
  if (!stories.size) return { ok: false, errors: ['empty_story_whitelist'] };

  if (!list.length) return { ok: true, tasks: [] };

  const tasks = [];
  const seen = new Set();

  for (let i = 0; i < list.length; i += 1) {
    const row = list[i];
    if (!row || typeof row !== 'object') {
      return { ok: false, errors: [`row_${i}_invalid`] };
    }
    const id = String(row.id || row.taskId || '').trim();
    if (!id) return { ok: false, errors: [`row_${i}_missing_id`] };
    if (seen.has(id)) return { ok: false, errors: [`dup_id_${id}`] };
    seen.add(id);

    const level = String(row.level || row.type || 'task')
      .trim()
      .toLowerCase();
    if (level !== 'task') {
      return {
        ok: false,
        errors: [`invalid_level_${id}:${level}`, 'expected_level_task'],
      };
    }

    const parentStoryId = String(
      row.parentStoryId || row.parentId || ''
    ).trim();
    if (!parentStoryId) {
      return { ok: false, errors: [`missing_parentStoryId_${id}`] };
    }
    if (!stories.has(parentStoryId)) {
      return {
        ok: false,
        errors: [
          `invalid_parentStoryId_${id}`,
          `received=${parentStoryId}`,
          `whitelist=${[...stories].slice(0, 12).join('|')}`,
        ],
      };
    }

    const parentStory = byId.get(parentStoryId) || {};
    const frOk = storyFrWhitelist(parentStory);
    const acOk = storyAcWhitelist(parentStory);

    const sourceFrIds = Array.isArray(row.sourceFrIds)
      ? row.sourceFrIds.map((x) => normalizeRef(x)).filter(Boolean)
      : [];
    for (const fr of sourceFrIds) {
      if (!frOk.has(fr)) {
        return {
          ok: false,
          errors: [
            `invalid_sourceFrId_${id}`,
            `received=${fr}`,
            `whitelist=${[...frOk].slice(0, 12).join('|')}`,
          ],
        };
      }
    }
    if (frOk.size > 0 && sourceFrIds.length === 0) {
      return {
        ok: false,
        errors: [`missing_sourceFrIds_${id}`, 'story_has_fr_requires_cite'],
      };
    }

    const acRefs = Array.isArray(row.acRefs)
      ? row.acRefs.map((x) => normalizeRef(x)).filter(Boolean)
      : [];
    for (const ac of acRefs) {
      if (!acOk.has(ac) && !acRefAllowed(ac, acOk)) {
        return {
          ok: false,
          errors: [
            `invalid_acRef_${id}`,
            `received=${ac}`,
            `whitelist=${[...acOk].slice(0, 12).join('|')}`,
          ],
        };
      }
    }
    if (acOk.size > 0 && acRefs.length === 0) {
      return {
        ok: false,
        errors: [`missing_acRefs_${id}`, 'story_has_ac_requires_cite'],
      };
    }

    const area = String(row.area || 'backend')
      .trim()
      .toLowerCase();

    const taskName = String(row.name || id).trim() || id;
    const storyTitle = String(parentStory.name || parentStory.title || '').trim();
    const deliverable = String(row.deliverable || '').trim();
    if (deliverable.length < DELIVERABLE_MIN_LEN) {
      return {
        ok: false,
        errors: [`missing_deliverable_${id}`, 'deliverable_min_len'],
      };
    }
    if (
      normalizeAcKey(deliverable) === normalizeAcKey(taskName) ||
      (storyTitle && normalizeAcKey(deliverable) === normalizeAcKey(storyTitle))
    ) {
      return {
        ok: false,
        errors: [`weak_deliverable_${id}`, 'deliverable_not_title_copy'],
      };
    }

    const doneWhen = String(
      row.doneWhen || row.completionCriteria || row.doneCriteria || ''
    ).trim();
    if (doneWhen.length < DONE_WHEN_MIN_LEN) {
      return {
        ok: false,
        errors: [`missing_doneWhen_${id}`, 'doneWhen_min_len'],
      };
    }
    if (normalizeAcKey(doneWhen) === normalizeAcKey(taskName)) {
      return {
        ok: false,
        errors: [`weak_doneWhen_${id}`, 'doneWhen_not_title_copy'],
      };
    }

    // P1: effortSeedHours optional soft hint only — never copy to effortHours.
    const rawSeed = row.effortSeedHours ?? row.effortHours;
    let effortSeedHours;
    if (rawSeed !== undefined && rawSeed !== null && String(rawSeed).trim() !== '') {
      const effort = Number(rawSeed);
      if (!Number.isFinite(effort) || effort <= 0) {
        return { ok: false, errors: [`invalid_effort_${id}`] };
      }
      effortSeedHours = effort;
    }

    // Persist as-is (only coerce parentId alias for tree consumers — same value)
    const task = {
      id,
      name: taskName,
      parentId: parentStoryId,
      parentStoryId,
      level: 'task',
      area: area || 'backend',
      sourceFrIds,
      acRefs,
      deliverable,
      doneWhen,
      suggestedRoleKey: row.suggestedRoleKey || undefined,
      sortOrder: Number.isFinite(Number(row.sortOrder)) ? Number(row.sortOrder) : i,
    };
    if (effortSeedHours != null) task.effortSeedHours = effortSeedHours;
    tasks.push(task);
  }

  return { ok: true, tasks };
}

/**
 * Soft presence — stories without leaves are unresolved (no invent, no hard-fail).
 * @returns {{ ok: true, unresolvedStoryIds: string[] }}
 */
function reportStoryTaskPresence(tasks, stories = []) {
  const need = (Array.isArray(stories) ? stories : []).filter(
    (s) => s && s.needsDecomposition !== false && s.id
  );
  const covered = new Set();
  for (const t of tasks || []) {
    const pid = normalizeRef(t.parentStoryId || t.parentId);
    if (pid) covered.add(pid);
  }
  const unresolvedStoryIds = need
    .filter((s) => !covered.has(String(s.id)))
    .map((s) => String(s.id));
  return { ok: true, unresolvedStoryIds };
}

/**
 * @deprecated P0 soft semantics — use reportStoryTaskPresence.
 * Kept for callers; never hard-fails on missing story tasks.
 */
function assertStoryTaskCoverage(tasks, stories = []) {
  return reportStoryTaskPresence(tasks, stories);
}

/**
 * For stories that have ≥1 leaf: every story FR/AC must be cited by ≥1 leaf.
 * @returns {{ uncoveredFrIds: string[], uncoveredAcKeys: string[] }}
 */
function assertFrAcCoverage(tasks, stories = []) {
  const uncoveredFrIds = [];
  const uncoveredAcKeys = [];
  const leavesByStory = new Map();
  for (const t of tasks || []) {
    const pid = normalizeRef(t.parentStoryId || t.parentId);
    if (!pid) continue;
    if (!leavesByStory.has(pid)) leavesByStory.set(pid, []);
    leavesByStory.get(pid).push(t);
  }

  for (const story of Array.isArray(stories) ? stories : []) {
    if (!story || story.needsDecomposition === false || !story.id) continue;
    const sid = String(story.id);
    const leaves = leavesByStory.get(sid);
    if (!leaves || !leaves.length) continue; // unresolved handled by presence report

    const citedFr = new Set();
    const citedAc = new Set();
    for (const leaf of leaves) {
      for (const fr of leaf.sourceFrIds || []) citedFr.add(normalizeRef(fr));
      for (const ac of leaf.acRefs || []) citedAc.add(normalizeRef(ac));
    }

    for (const fr of storyFrWhitelist(story)) {
      if (!citedFr.has(fr)) uncoveredFrIds.push(`${sid}:${fr}`);
    }
    const citedAcList = [];
    for (const leaf of leaves) {
      for (const ac of leaf.acRefs || []) citedAcList.push(ac);
    }
    for (const ac of storyAcWhitelist(story)) {
      if (!acCitationCoversWhitelist(ac, citedAcList)) {
        uncoveredAcKeys.push(`${sid}:${ac}`);
      }
    }
  }

  return { uncoveredFrIds, uncoveredAcKeys };
}

/**
 * @returns {'success'|'partial'}
 */
function resolveDecompositionOutcome({
  leafCount = 0,
  unresolvedStoryIds = [],
  uncoveredFrIds = [],
  uncoveredAcKeys = [],
}) {
  if (leafCount <= 0) return 'partial';
  if (
    unresolvedStoryIds.length > 0 ||
    uncoveredFrIds.length > 0 ||
    uncoveredAcKeys.length > 0
  ) {
    return 'partial';
  }
  return 'success';
}

function buildWbsStoryLlmPrompt({
  stories = [],
  contextPackage = null,
  env = process.env,
  localeInstruction = '',
}) {
  void env;
  const storyPayload = stories.map((s) => ({
    id: s.id,
    name: truncate(s.name || s.id, STORY_NAME_MAX),
    description: truncate(s.description || '', STORY_DESC_MAX),
    fr: (Array.isArray(s.sourceFrIds) ? s.sourceFrIds : [])
      .slice(0, STORY_FR_MAX)
      .map((x) => normalizeRef(x))
      .filter(Boolean),
    ac: storyAcList(s),
    nfr: (Array.isArray(s.sourceNfrIds) ? s.sourceNfrIds : [])
      .slice(0, 8)
      .map((x) => normalizeRef(x))
      .filter(Boolean),
  }));
  const { ctxLine, itemCount, mode } = buildCtxPromptFragment(contextPackage, {
    maxItems: WBS_CTX_MAX_ITEMS,
    maxChars: WBS_CTX_MAX_CHARS,
  });
  logHowCtx('propose-wbs', contextPackage, itemCount);

  const lines = [
    localeInstruction || 'Respond in the same language as story titles.',
    'WBS task leaves JSON only. No prose. No epic/feature/story/work_package nodes.',
    'Shape:{"nodes":[{"id","name","level":"task","parentStoryId","sourceFrIds","acRefs","deliverable","doneWhen","area","effortSeedHours?"}]}',
    'Rules: Use story name+description+fr+ac (required fields) to decompose; stories MAY have zero tasks (system marks unresolved — do not invent filler). parentStoryId MUST be exact STORY id from list; sourceFrIds ⊆ that story.fr and non-empty when story.fr non-empty; acRefs ⊆ that story.ac and non-empty when story.ac non-empty; deliverable = concrete output (not story/task title copy); doneWhen = measurable completion condition; NEVER invent ids; NEVER copy story title as task name; effortSeedHours is optional soft hint only (not the official estimate); area∈frontend|backend|qa|design|infra. Prefer justified leaves over count; do not invent BE+FE+QA to fill a quota.',
    `STORIES=${JSON.stringify(storyPayload)}`,
  ];
  if (ctxLine) lines.push(ctxLine);
  if (mode) lines.push(`CTX_MODE=${mode}`);
  return lines.join('\n');
}

function materializeWbsFromBacklogAndLeaves(backlog, leaves) {
  const containers = backlogNodesAsTasks(backlog);
  const tasks = [...containers, ...(Array.isArray(leaves) ? leaves : [])];
  const roots = tasks.filter((t) => !t.parentId).map((t) => t.id);
  return {
    tasks,
    wbs: {
      roots,
      nodes: tasks,
      taskCount: leaves.length,
    },
  };
}

function slugDedupeName(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/**
 * Cross-story/chunk leaf dedupe — first wins; later get duplicateOf.
 * Coverage still uses all leaves (including duplicates).
 * @returns {{ leaves: object[], duplicateLeafIds: string[], uniqueLeafCount: number }}
 */
function dedupeWbsLeaves(leaves = []) {
  const seen = new Map();
  const duplicateLeafIds = [];
  const out = [];
  for (const leaf of Array.isArray(leaves) ? leaves : []) {
    if (!leaf || typeof leaf !== 'object') continue;
    const fr = (Array.isArray(leaf.sourceFrIds) ? leaf.sourceFrIds : [])
      .map((x) => normalizeRef(x))
      .filter(Boolean)
      .sort();
    const area = String(leaf.area || 'backend')
      .trim()
      .toLowerCase();
    const key = `${slugDedupeName(leaf.name)}|${area}|${fr.join(',')}`;
    if (seen.has(key)) {
      const firstId = seen.get(key);
      out.push({ ...leaf, duplicateOf: firstId });
      duplicateLeafIds.push(String(leaf.id));
    } else {
      seen.set(key, leaf.id);
      out.push({ ...leaf });
    }
  }
  return {
    leaves: out,
    duplicateLeafIds,
    uniqueLeafCount: out.length - duplicateLeafIds.length,
  };
}

/**
 * @param {{
 *   backlog: object,
 *   contextPackage?: object|null,
 *   env?: object,
 *   generateJsonFn?: Function,
 *   pack?: object,
 * }} opts
 */
async function proposeWbsTasksWithLlm(opts = {}) {
  const env = opts.env || process.env;
  const backlog = opts.backlog || {};
  const pack = opts.pack || {};
  const stories = enrichStoriesWithPack(
    (Array.isArray(backlog.stories) ? backlog.stories : []).filter(
      (s) => s && s.needsDecomposition !== false
    ),
    pack
  );

  if (!isHowWbsLlmFlagOn(env)) {
    return {
      ok: false,
      meta: {
        source: 'llm_failed',
        decompositionOutcome: 'failure',
        fallbackReason: 'HOW_WBS_LLM_off',
        reasonCodes: ['HOW_WBS_LLM_off'],
        llmCalls: 0,
      },
    };
  }
  if (!isLlmEnabled(env)) {
    return {
      ok: false,
      meta: {
        source: 'llm_failed',
        decompositionOutcome: 'failure',
        fallbackReason: 'AI_PLANNING_LLM_off',
        reasonCodes: ['AI_PLANNING_LLM_off'],
        llmCalls: 0,
      },
    };
  }
  if (!stories.length) {
    return {
      ok: false,
      meta: {
        source: 'llm_failed',
        decompositionOutcome: 'failure',
        fallbackReason: 'empty_backlog_stories',
        reasonCodes: ['empty_backlog_stories'],
        llmCalls: 0,
      },
    };
  }

  let languageInstruction = '';
  try {
    const {
      normalizeDeriveLocale,
      languageInstruction: langFn,
    } = require('../semantic/buildSemanticDeriveContext');
    const locale = normalizeDeriveLocale(
      opts.pack?.aiAnalysis?.deriveLocale || opts.pack?.locale || env.PHASE1_DERIVE_LOCALE
    );
    languageInstruction = langFn(locale);
  } catch {
    languageInstruction = '';
  }

  const chunkSize = Math.max(
    1,
    Math.min(4, Number(env.HOW_WBS_STORY_CHUNK) || 4)
  );
  const chunks = [];
  for (let i = 0; i < stories.length; i += chunkSize) {
    chunks.push(stories.slice(i, i + chunkSize));
  }

  const gen = typeof opts.generateJsonFn === 'function' ? opts.generateJsonFn : generateJson;
  const numCtx = resolveWbsLlmNumCtx(env);
  const timeoutMs = resolveWbsLlmTimeoutMs(env);
  const t0 = Date.now();
  const allLeaves = [];
  let llmCalls = 0;
  let lastModel = null;
  let promptChars = 0;

  for (let ci = 0; ci < chunks.length; ci += 1) {
    const chunkStories = chunks[ci];
    const chunkBacklog = { ...backlog, stories: chunkStories };
    const prompt = buildWbsStoryLlmPrompt({
      stories: chunkStories,
      contextPackage: opts.contextPackage || null,
      env,
      localeInstruction: languageInstruction,
    });
    promptChars += prompt.length;
    const numPredict = resolveWbsLlmNumPredict(
      Math.max(chunkStories.length * 3, 8),
      env
    );

    let llmResult;
    try {
      llmResult = await gen({
        prompt,
        numPredict,
        numCtx,
        timeoutMs,
        temperature: 0.1,
        env,
      });
    } catch (err) {
      return {
        ok: false,
        meta: {
          source: 'llm_failed',
          decompositionOutcome: 'failure',
          fallbackReason: String(err?.message || err || 'llm_throw'),
          reasonCodes: ['llm_throw', `chunk_${ci}`],
          llmCalls: llmCalls + 1,
          llmMs: Date.now() - t0,
          promptChars,
        },
      };
    }
    llmCalls += 1;
    lastModel = llmResult?.model || lastModel;

    if (!llmResult?.ok || llmResult.data == null) {
      return {
        ok: false,
        meta: {
          source: 'llm_failed',
          decompositionOutcome: 'failure',
          fallbackReason: llmResult?.error || 'llm_failed',
          reasonCodes: [llmResult?.error || 'llm_failed', `chunk_${ci}`],
          llmCalls,
          llmMs: Date.now() - t0,
          model: lastModel,
          promptChars,
        },
      };
    }

    const accepted = acceptWbsStoryTasks(llmResult.data, chunkBacklog);
    if (!accepted.ok) {
      console.error(
        '[how-propose-wbs] contract_fail',
        `chunk=${ci}`,
        (accepted.errors || []).join(';')
      );
      return {
        ok: false,
        meta: {
          source: 'llm_invalid',
          decompositionOutcome: 'failure',
          fallbackReason: (accepted.errors || ['contract_fail']).join(','),
          reasonCodes: [...(accepted.errors || ['contract_fail']), `chunk_${ci}`],
          llmCalls,
          llmMs: Date.now() - t0,
          model: lastModel,
          promptChars,
        },
      };
    }

    // Prefix ids per chunk to avoid collisions across calls
    for (const leaf of accepted.tasks) {
      allLeaves.push({
        ...leaf,
        id: `c${ci}-${leaf.id}`,
      });
    }
  }

  const deduped = dedupeWbsLeaves(allLeaves);
  const leaves = deduped.leaves;

  // Coverage uses every leaf (including duplicates) so second story stays traced.
  const presence = reportStoryTaskPresence(leaves, stories);
  const frAc = assertFrAcCoverage(leaves, stories);
  const decompositionOutcome = resolveDecompositionOutcome({
    leafCount: leaves.length,
    unresolvedStoryIds: presence.unresolvedStoryIds,
    uncoveredFrIds: frAc.uncoveredFrIds,
    uncoveredAcKeys: frAc.uncoveredAcKeys,
  });

  console.info(
    `[how-propose-wbs] outcome=${decompositionOutcome} leaves=${leaves.length} unique=${deduped.uniqueLeafCount} dup=${deduped.duplicateLeafIds.length} unresolved=${presence.unresolvedStoryIds.length} uncoveredFr=${frAc.uncoveredFrIds.length} uncoveredAc=${frAc.uncoveredAcKeys.length}`
  );

  const materialized = materializeWbsFromBacklogAndLeaves(backlog, leaves);
  return {
    ok: true,
    tasks: materialized.tasks,
    wbs: materialized.wbs,
    meta: {
      source: chunks.length > 1 ? 'llm_story_tasks_chunked' : 'llm_story_tasks',
      decompositionOutcome,
      unresolvedStoryIds: presence.unresolvedStoryIds,
      uncoveredFrIds: frAc.uncoveredFrIds,
      uncoveredAcKeys: frAc.uncoveredAcKeys,
      duplicateLeafIds: deduped.duplicateLeafIds,
      uniqueLeafCount: deduped.uniqueLeafCount,
      llmCalls,
      llmMs: Date.now() - t0,
      model: lastModel,
      promptChars,
      storyCount: stories.length,
      leafCount: leaves.length,
      chunks: chunks.length,
      ctxItems: buildCtxPromptFragment(opts.contextPackage, {
        maxItems: WBS_CTX_MAX_ITEMS,
        maxChars: WBS_CTX_MAX_CHARS,
      }).itemCount,
    },
  };
}

function isHowWbsLlmEnabled(env = process.env) {
  return isHowWbsLlmFlagOn(env) && isLlmEnabled(env);
}

module.exports = {
  proposeWbsTasksWithLlm,
  acceptWbsStoryTasks,
  assertStoryTaskCoverage,
  reportStoryTaskPresence,
  assertFrAcCoverage,
  resolveDecompositionOutcome,
  buildWbsStoryLlmPrompt,
  materializeWbsFromBacklogAndLeaves,
  dedupeWbsLeaves,
  isHowWbsLlmEnabled,
  acRefAllowed,
  normalizeAcKey,
  acCitationCoversWhitelist,
  WBS_CTX_MAX_ITEMS,
  WBS_CTX_MAX_CHARS,
};
