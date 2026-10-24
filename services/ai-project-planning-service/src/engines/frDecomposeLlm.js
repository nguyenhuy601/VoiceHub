/**
 * Phase WHAT — FR Decompose LLM: sizing Epic → Story from analyzed FR/UC/AC.
 * RULE-01: CR-* never Story/Epic sole cite.
 * RULE-02: no 1 FR→1 Story invent; no UC≥2 auto-story (LLM + accept only).
 * RULE-03: Story may have parentEpicId null.
 */

const { generateJson, isLlmEnabled } = require('../runtime/ollamaGenerate');
const {
  FR_DECOMPOSE_SHAPE_VERSION,
  FR_DECOMPOSE_MAX_EPICS,
  FR_DECOMPOSE_MAX_STORIES,
  FR_DECOMPOSE_MAX_AC_PER_STORY,
  isWhatFrDecomposeFlagOn,
  resolveFrDecomposeMaxFr,
  resolveFrDecomposeNumCtx,
  resolveFrDecomposeTimeoutMs,
  resolveFrDecomposeNumPredict,
  resolveFrDecomposeChunk,
} = require('../contracts/frDecomposeContract');

const NAME_MAX = 240;
const DESC_MAX = 800;
const AC_CHARS = 240;

function truncate(text, max) {
  const s = String(text || '').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

function normalizeRef(raw) {
  return String(raw || '').trim();
}

/** Customer Raw CR-* — never backlog structure seed. */
function isCustomerRequirementId(raw) {
  const s = String(raw || '').trim();
  if (!s) return false;
  if (/^(CR)[-_.\s]?\d+/i.test(s)) return true;
  const compact = s.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return /^cr\d+$/i.test(compact);
}

function extractAcList(row) {
  if (Array.isArray(row?.acceptanceCriteriaList)) {
    return row.acceptanceCriteriaList
      .map((x) => truncate(x, AC_CHARS))
      .filter(Boolean)
      .slice(0, FR_DECOMPOSE_MAX_AC_PER_STORY);
  }
  const raw = row?.ac || row?.acceptanceCriteria || row?.acceptance || '';
  if (typeof raw !== 'string' || !raw.trim()) return [];
  return raw
    .split(/\n|;/)
    .map((s) => s.replace(/^[-*•\d.)\s]+/, '').trim())
    .map((s) => truncate(s, AC_CHARS))
    .filter((s) => s.length >= 3)
    .slice(0, FR_DECOMPOSE_MAX_AC_PER_STORY);
}

/**
 * Build FR whitelist rows for prompt + accept from pack / proposal items.
 * @param {object} pack
 * @param {object[]} [proposalItems]
 * @param {NodeJS.ProcessEnv} [env]
 */
function listFrCandidatesForDecompose(pack = {}, proposalItems = [], env = process.env) {
  const max = resolveFrDecomposeMaxFr(env);
  const fromProposal = Array.isArray(proposalItems) ? proposalItems : [];
  const fromPack = Array.isArray(pack.functionalRequirements)
    ? pack.functionalRequirements
    : Array.isArray(pack.frList)
      ? pack.frList
      : [];

  const out = [];
  const seen = new Set();

  function pushRow(row, index) {
    const id = normalizeRef(
      row?.logicalId || row?.externalId || row?.id || row?.frId || `FR-${index + 1}`
    );
    if (!id || seen.has(id) || isCustomerRequirementId(id)) return;
    const kind = String(row?.type || row?.kind || row?.category || '').toLowerCase();
    if (/\bnfr\b|non[-_\s]?functional/.test(kind)) return;
    seen.add(id);
    const ac = extractAcList(row);
    const item = {
      id,
      name: truncate(row?.title || row?.name || id, NAME_MAX) || id,
      description: truncate(row?.description || row?.detail || row?.text || '', DESC_MAX),
      ac,
      actor: truncate(
        Array.isArray(row?.actors) ? row.actors[0] : row?.actor || '',
        80
      ),
      priority: truncate(row?.priority || '', 40),
      capability: truncate(
        row?.semanticInterpretation?.capability || row?.capability || '',
        200
      ),
      intent: truncate(row?.semanticInterpretation?.intent || row?.intent || '', 200),
    };
    if (!item.description) delete item.description;
    if (!item.actor) delete item.actor;
    if (!item.priority) delete item.priority;
    if (!item.capability) delete item.capability;
    if (!item.intent) delete item.intent;
    out.push(item);
  }

  fromProposal.forEach((row, i) => pushRow(row, i));
  fromPack.forEach((row, i) => {
    if (out.length >= max) return;
    pushRow(row, i);
  });
  return out.slice(0, max);
}

function listUcBrief(pack = {}, max = 40) {
  const rows = Array.isArray(pack.useCases)
    ? pack.useCases
    : Array.isArray(pack.ucList)
      ? pack.ucList
      : [];
  return rows
    .slice(0, max)
    .map((uc, i) => {
      const id = normalizeRef(
        uc?.externalId || uc?.ucId || uc?.id || `UC-${i + 1}`
      );
      if (!id || isCustomerRequirementId(id)) return null;
      const frIds = [
        ...(Array.isArray(uc.sourceFrIds) ? uc.sourceFrIds : []),
        ...(Array.isArray(uc.frIds) ? uc.frIds : []),
        ...(Array.isArray(uc.relatedFrIds) ? uc.relatedFrIds : []),
      ]
        .map(normalizeRef)
        .filter((fid) => fid && !isCustomerRequirementId(fid));
      return {
        id,
        name: truncate(uc.name || uc.title || id, NAME_MAX),
        frIds: [...new Set(frIds)].slice(0, 16),
      };
    })
    .filter(Boolean);
}

/**
 * Strict accept — no invent FR; reject CR cites; orphan epic parent.
 * @returns {{ ok: true, backlogStructure: object } | { ok: false, errors: string[] }}
 */
function acceptFrDecomposeStructure(raw, frWhitelist = [], opts = {}) {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, errors: ['not_object'] };
  }
  raw = coerceDecomposePayload(raw);

  const frOk = new Set(
    (Array.isArray(frWhitelist) ? frWhitelist : [])
      .map((f) => (typeof f === 'string' ? f : f?.id))
      .map(normalizeRef)
      .filter(Boolean)
  );
  if (!frOk.size) return { ok: false, errors: ['empty_fr_whitelist'] };

  const frById = new Map();
  for (const f of Array.isArray(frWhitelist) ? frWhitelist : []) {
    if (typeof f === 'object' && f?.id) frById.set(normalizeRef(f.id), f);
  }

  const epicsRaw = Array.isArray(raw.epics) ? raw.epics : [];
  const storiesRaw = Array.isArray(raw.stories) ? raw.stories : [];
  if (!storiesRaw.length) {
    return { ok: false, errors: ['missing_stories'] };
  }

  const epics = [];
  const epicIds = new Set();
  for (let i = 0; i < epicsRaw.length && epics.length < FR_DECOMPOSE_MAX_EPICS; i += 1) {
    const row = epicsRaw[i];
    if (!row || typeof row !== 'object') {
      return { ok: false, errors: [`epic_${i}_invalid`] };
    }
    const id = normalizeRef(row.id || row.epicId);
    if (!id) return { ok: false, errors: [`epic_${i}_missing_id`] };
    if (isCustomerRequirementId(id) || /^EPIC-cr\d+/i.test(id)) {
      return { ok: false, errors: [`epic_cr_forbidden_${id}`] };
    }
    if (epicIds.has(id)) return { ok: false, errors: [`dup_epic_${id}`] };
    epicIds.add(id);

    const sourceFrIds = Array.isArray(row.sourceFrIds)
      ? row.sourceFrIds.map(normalizeRef).filter(Boolean)
      : [];
    for (const fr of sourceFrIds) {
      if (isCustomerRequirementId(fr)) {
        return { ok: false, errors: [`epic_cr_fr_${id}`, `received=${fr}`] };
      }
      if (!frOk.has(fr)) {
        return {
          ok: false,
          errors: [`invalid_epic_sourceFrId_${id}`, `received=${fr}`],
        };
      }
    }

    epics.push({
      id,
      name: truncate(row.name || row.title || id, NAME_MAX) || id,
      description: truncate(row.description || row.goal || '', DESC_MAX) || undefined,
      sourceFrIds,
      storyIds: Array.isArray(row.storyIds)
        ? row.storyIds.map(normalizeRef).filter(Boolean)
        : [],
      rationale: truncate(row.rationale || '', 200) || undefined,
    });
    if (!epics[epics.length - 1].description) delete epics[epics.length - 1].description;
    if (!epics[epics.length - 1].rationale) delete epics[epics.length - 1].rationale;
  }

  const stories = [];
  const storyIds = new Set();
  const coveredFr = new Set();

  for (let i = 0; i < storiesRaw.length && stories.length < FR_DECOMPOSE_MAX_STORIES; i += 1) {
    const row = storiesRaw[i];
    if (!row || typeof row !== 'object') {
      return { ok: false, errors: [`story_${i}_invalid`] };
    }
    const id = normalizeRef(row.id || row.storyId);
    if (!id) return { ok: false, errors: [`story_${i}_missing_id`] };
    if (
      isCustomerRequirementId(id) ||
      /^STORY-cr\d+/i.test(id) ||
      /^STORY-NFR/i.test(id)
    ) {
      return { ok: false, errors: [`story_cr_or_nfr_forbidden_${id}`] };
    }
    if (storyIds.has(id)) return { ok: false, errors: [`dup_story_${id}`] };
    storyIds.add(id);

    let parentEpicId = row.parentEpicId;
    if (parentEpicId === undefined || parentEpicId === null || parentEpicId === '') {
      parentEpicId = null;
    } else {
      parentEpicId = normalizeRef(parentEpicId);
      if (!epicIds.has(parentEpicId)) {
        return {
          ok: false,
          errors: [
            `orphan_parentEpicId_${id}`,
            `received=${parentEpicId}`,
            `whitelist=${[...epicIds].slice(0, 12).join('|')}`,
          ],
        };
      }
    }

    const sourceFrIds = Array.isArray(row.sourceFrIds)
      ? row.sourceFrIds.map(normalizeRef).filter(Boolean)
      : [];
    if (!sourceFrIds.length) {
      return { ok: false, errors: [`missing_sourceFrIds_${id}`] };
    }
    for (const fr of sourceFrIds) {
      if (isCustomerRequirementId(fr)) {
        return { ok: false, errors: [`story_cr_fr_${id}`, `received=${fr}`] };
      }
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
      coveredFr.add(fr);
    }

    const sourceUcIds = Array.isArray(row.sourceUcIds)
      ? row.sourceUcIds.map(normalizeRef).filter((u) => u && !isCustomerRequirementId(u))
      : [];

    let acRefs = Array.isArray(row.acRefs)
      ? row.acRefs.map(normalizeRef).filter(Boolean).slice(0, FR_DECOMPOSE_MAX_AC_PER_STORY)
      : [];
    // Soft-fill AC from FR whitelist when LLM omits
    if (!acRefs.length) {
      for (const fr of sourceFrIds) {
        const frRow = frById.get(fr);
        for (const ac of frRow?.ac || []) {
          if (!acRefs.includes(ac)) acRefs.push(ac);
          if (acRefs.length >= FR_DECOMPOSE_MAX_AC_PER_STORY) break;
        }
        if (acRefs.length >= FR_DECOMPOSE_MAX_AC_PER_STORY) break;
      }
    }

    stories.push({
      id,
      name: truncate(row.name || row.title || id, NAME_MAX) || id,
      description: truncate(row.description || '', DESC_MAX) || undefined,
      parentEpicId,
      sourceFrIds,
      sourceUcIds,
      acRefs,
      needsDecomposition: row.needsDecomposition !== false,
      rationale: truncate(row.rationale || '', 200) || undefined,
    });
    const last = stories[stories.length - 1];
    if (!last.description) delete last.description;
    if (!last.rationale) delete last.rationale;
    if (!last.sourceUcIds.length) delete last.sourceUcIds;
  }

  // Sync epic.storyIds from stories
  for (const epic of epics) {
    const kids = stories
      .filter((s) => s.parentEpicId === epic.id)
      .map((s) => s.id);
    epic.storyIds = kids.length ? kids : (epic.storyIds || []).filter((sid) => storyIds.has(sid));
  }

  const unmappedFromLlm = Array.isArray(raw.unmappedFrIds)
    ? raw.unmappedFrIds.map(normalizeRef).filter((id) => frOk.has(id) && !coveredFr.has(id))
    : [];
  const unmappedFrIds = [
    ...new Set([
      ...unmappedFromLlm,
      ...[...frOk].filter((id) => !coveredFr.has(id)),
    ]),
  ];

  const openQuestions = Array.isArray(raw.openQuestions)
    ? raw.openQuestions
        .slice(0, 24)
        .map((q, i) => ({
          code: truncate(q?.code || `CQ-DECOMPOSE-${i + 1}`, 64),
          message: truncate(q?.message || q?.issue || '', 280),
          frIds: Array.isArray(q?.frIds)
            ? q.frIds.map(normalizeRef).filter((id) => frOk.has(id)).slice(0, 8)
            : [],
        }))
        .filter((q) => q.message)
    : [];

  return {
    ok: true,
    backlogStructure: {
      epics,
      stories,
      features: [],
      unmappedFrIds,
      openQuestions,
      meta: {
        source: 'llm_fr_decompose',
        shapeVersion: FR_DECOMPOSE_SHAPE_VERSION,
        epicCount: epics.length,
        storyCount: stories.length,
        frCount: frOk.size,
        unmappedCount: unmappedFrIds.length,
        ...(opts.meta && typeof opts.meta === 'object' ? opts.meta : {}),
      },
    },
  };
}

/** Lift stories nested under epics so a truncated or nested JSON still accepts. */
function coerceDecomposePayload(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  const epics = Array.isArray(raw.epics)
    ? raw.epics
    : Array.isArray(raw.epic)
      ? raw.epic
      : [];
  const stories = [];
  if (Array.isArray(raw.stories)) stories.push(...raw.stories);
  else if (Array.isArray(raw.story)) stories.push(...raw.story);
  for (const epic of epics) {
    const kids = Array.isArray(epic?.stories)
      ? epic.stories
      : Array.isArray(epic?.children)
        ? epic.children
        : [];
    for (const story of kids) {
      if (!story || typeof story !== 'object') continue;
      stories.push({
        ...story,
        parentEpicId: story.parentEpicId || epic.id || epic.epicId || null,
      });
    }
  }
  return { ...raw, epics, stories };
}

function prefixAcceptedStructure(structure, prefix) {
  const epicMap = new Map();
  const epics = (structure.epics || []).map((epic) => {
    const id = `${prefix}${epic.id}`;
    epicMap.set(epic.id, id);
    return { ...epic, id };
  });
  const stories = (structure.stories || []).map((story) => ({
    ...story,
    id: `${prefix}${story.id}`,
    parentEpicId: story.parentEpicId
      ? epicMap.get(story.parentEpicId) || null
      : null,
  }));
  return { epics, stories, openQuestions: structure.openQuestions || [] };
}

function renumberBacklog(epics, stories) {
  const epicMap = new Map();
  const nextEpics = epics.map((epic, index) => {
    const id = `EPIC-${index + 1}`;
    epicMap.set(epic.id, id);
    return { ...epic, id, storyIds: [] };
  });
  const nextStories = stories.map((story, index) => {
    const id = `STORY-${index + 1}`;
    const parent = story.parentEpicId ? epicMap.get(story.parentEpicId) || null : null;
    return { ...story, id, parentEpicId: parent };
  });
  for (const epic of nextEpics) {
    epic.storyIds = nextStories.filter((story) => story.parentEpicId === epic.id).map((story) => story.id);
  }
  return { epics: nextEpics, stories: nextStories };
}

function buildFrDecomposePrompt({
  frCandidates = [],
  useCases = [],
  localeInstruction = '',
  semantic = null,
}) {
  const frPayload = frCandidates.map((f) => ({
    id: f.id,
    name: f.name,
    description: f.description ? truncate(f.description, DESC_MAX) : undefined,
    ac: Array.isArray(f.ac) ? f.ac.slice(0, FR_DECOMPOSE_MAX_AC_PER_STORY) : [],
    actor: f.actor || undefined,
  }));
  const lines = [
    localeInstruction || 'Respond in the same language as FR titles.',
    'FR backlog structure JSON only. No prose. MVP: Epic → Story (Story may have parentEpicId null). No Feature nodes.',
    'The stories array is required and must be non-empty. Write stories before long epic text.',
    'Shape:{"stories":[{"id","name","parentEpicId","sourceFrIds","acRefs"}],"epics":[{"id","name","sourceFrIds"}]}',
    'Rules: Size by business outcome — clear AC goal → Story; ≥3 independent stories same outcome → Epic candidate; do NOT default 1 FR→1 Story; do NOT auto-create Story only because UC links ≥2 FR; parentEpicId null allowed; sourceFrIds ⊆ APPROVED_FR ids and non-empty; NEVER use CR-* or NFR as Story/Epic/FR cite; acRefs from FR.ac when possible; unmappedFrIds for FR not placed; prefer justified structure over count.',
    `APPROVED_FR=${JSON.stringify(frPayload)}`,
  ];
  if (useCases.length) {
    lines.push(`UC=${JSON.stringify(useCases.slice(0, 40))}`);
  }
  if (semantic && typeof semantic === 'object') {
    lines.push(`SEMANTIC=${JSON.stringify(semantic)}`);
  }
  return lines.join('\n');
}

/**
 * @param {{
 *   pack?: object,
 *   proposalItems?: object[],
 *   semantic?: object|null,
 *   env?: object,
 *   generateJsonFn?: Function,
 *   localeInstruction?: string,
 * }} opts
 */
async function proposeFrDecomposeWithLlm(opts = {}) {
  const env = opts.env || process.env;
  const pack = opts.pack || {};

  if (!isWhatFrDecomposeFlagOn(env)) {
    return {
      ok: false,
      meta: {
        source: 'llm_failed',
        fallbackReason: 'WHAT_FR_DECOMPOSE_off',
        reasonCodes: ['WHAT_FR_DECOMPOSE_off'],
        llmCalls: 0,
      },
    };
  }
  if (!isLlmEnabled(env)) {
    return {
      ok: false,
      meta: {
        source: 'llm_failed',
        fallbackReason: 'AI_PLANNING_LLM_off',
        reasonCodes: ['AI_PLANNING_LLM_off'],
        llmCalls: 0,
      },
    };
  }

  const frCandidates = listFrCandidatesForDecompose(
    pack,
    opts.proposalItems || [],
    env
  );
  if (!frCandidates.length) {
    return {
      ok: false,
      meta: {
        source: 'llm_failed',
        fallbackReason: 'empty_approved_fr',
        reasonCodes: ['empty_approved_fr'],
        llmCalls: 0,
      },
    };
  }

  const useCases = listUcBrief(pack);
  let localeInstruction = opts.localeInstruction || '';
  if (!localeInstruction) {
    try {
      const {
        normalizeDeriveLocale,
        languageInstruction: langFn,
      } = require('../semantic/buildSemanticDeriveContext');
      const locale = normalizeDeriveLocale(
        opts.semantic?.business?.locale ||
          pack?.aiAnalysis?.deriveLocale ||
          pack?.locale ||
          env.PHASE1_DERIVE_LOCALE
      );
      localeInstruction = langFn(locale);
    } catch {
      localeInstruction = '';
    }
  }

  const chunkSize = resolveFrDecomposeChunk(env);
  const chunks = [];
  for (let i = 0; i < frCandidates.length; i += chunkSize) {
    chunks.push(frCandidates.slice(i, i + chunkSize));
  }

  const gen = typeof opts.generateJsonFn === 'function' ? opts.generateJsonFn : generateJson;
  const t0 = Date.now();
  let llmCalls = 0;
  let lastModel = null;
  const mergedEpics = [];
  const mergedStories = [];
  const openQuestions = [];
  const failures = [];

  for (let ci = 0; ci < chunks.length; ci += 1) {
    const slice = chunks[ci];
    const sliceIds = new Set(slice.map((row) => row.id));
    const ucSlice = useCases.filter((uc) =>
      (uc.frIds || []).some((id) => sliceIds.has(id))
    );
    const prompt = buildFrDecomposePrompt({
      frCandidates: slice,
      useCases: ucSlice,
      localeInstruction,
      semantic: null,
    });
    let llmResult;
    try {
      llmResult = await gen({
        prompt,
        numPredict: resolveFrDecomposeNumPredict(env),
        numCtx: resolveFrDecomposeNumCtx(env),
        timeoutMs: resolveFrDecomposeTimeoutMs(env),
        temperature: 0.1,
        env,
      });
    } catch (err) {
      llmCalls += 1;
      failures.push(String(err?.message || err || 'llm_throw'));
      continue;
    }
    llmCalls += 1;
    lastModel = llmResult?.model || lastModel;
    if (!llmResult?.ok || llmResult.data == null) {
      failures.push(llmResult?.error || 'llm_failed');
      continue;
    }
    const accepted = acceptFrDecomposeStructure(llmResult.data, slice);
    if (!accepted.ok) {
      console.error(
        '[fr-decompose] contract_fail',
        `chunk=${ci}`,
        (accepted.errors || []).join(';'),
        `keys=${Object.keys(llmResult.data || {}).join(',')}`
      );
      failures.push(...(accepted.errors || ['contract_fail']));
      continue;
    }
    const piece =
      chunks.length > 1
        ? prefixAcceptedStructure(accepted.backlogStructure, `c${ci}-`)
        : accepted.backlogStructure;
    mergedEpics.push(...piece.epics);
    mergedStories.push(...piece.stories);
    openQuestions.push(...(accepted.backlogStructure.openQuestions || []));
  }

  if (!mergedStories.length) {
    return {
      ok: false,
      meta: {
        source: 'llm_invalid',
        fallbackReason: failures[0] || 'missing_stories',
        reasonCodes: failures.slice(0, 8),
        llmCalls,
        llmMs: Date.now() - t0,
        model: lastModel,
        chunks: chunks.length,
      },
    };
  }

  const numbered =
    chunks.length > 1
      ? renumberBacklog(mergedEpics, mergedStories)
      : { epics: mergedEpics, stories: mergedStories };
  const covered = new Set();
  for (const story of numbered.stories) {
    for (const id of story.sourceFrIds || []) covered.add(id);
  }
  const unmappedFrIds = frCandidates.map((row) => row.id).filter((id) => !covered.has(id));
  for (const epic of numbered.epics) {
    epic.storyIds = numbered.stories
      .filter((story) => story.parentEpicId === epic.id)
      .map((story) => story.id);
  }

  const backlogStructure = {
    epics: numbered.epics,
    stories: numbered.stories,
    features: [],
    unmappedFrIds,
    openQuestions: openQuestions.slice(0, 24),
    meta: {
      source: chunks.length > 1 ? 'llm_fr_decompose_chunked' : 'llm_fr_decompose',
      shapeVersion: FR_DECOMPOSE_SHAPE_VERSION,
      epicCount: numbered.epics.length,
      storyCount: numbered.stories.length,
      frCount: frCandidates.length,
      unmappedCount: unmappedFrIds.length,
      llmCalls,
      llmMs: Date.now() - t0,
      model: lastModel,
      chunks: chunks.length,
    },
  };

  console.info(
    `[fr_decompose] outcome=ok epics=${backlogStructure.epics.length} stories=${backlogStructure.stories.length} unmapped=${unmappedFrIds.length} chunks=${chunks.length}`
  );

  return {
    ok: true,
    backlogStructure,
    meta: backlogStructure.meta,
  };
}

module.exports = {
  isCustomerRequirementId,
  listFrCandidatesForDecompose,
  listUcBrief,
  acceptFrDecomposeStructure,
  buildFrDecomposePrompt,
  proposeFrDecomposeWithLlm,
  extractAcList,
};
