/**
 * Non-CR / legacy FR path — assign Epic map only (structure links).
 * RULE-E5 / R2: schema { epics[], links:[{ frId, parentEpicId }] } — never emit Story name/AC.
 * Not frDecomposeLlm.
 */

const { generateJson, isLlmEnabled } = require('../runtime/ollamaGenerate');
const { buildBacklogStructureFromFr } = require('./backlogStructure/buildBacklogStructureFromFr');

const NAME_MAX = 240;

function truncate(text, max) {
  const s = String(text || '').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

function normalizeRef(raw) {
  return String(raw || '').trim();
}

function isEpicId(raw) {
  return /^EPIC[-_.]/i.test(String(raw || '').trim());
}

function frPayload(items = []) {
  return (Array.isArray(items) ? items : []).map((row) => ({
    id: normalizeRef(row.id || row.logicalId || row.frId),
    name: truncate(row.name || row.title || '', NAME_MAX),
    ac: truncate(row.ac || row.acceptanceCriteria || '', 200),
  })).filter((r) => r.id);
}

function buildAssignFrEpicsPrompt({ frRows = [], localeInstruction = '' } = {}) {
  const { HIERARCHY_PROMPT_RULES } = require('../semantic/hierarchyPromptRules');
  return [
    localeInstruction || 'Respond in the same language as FR titles.',
    'Assign FR→Epic JSON only. No prose. Do NOT invent or rewrite Story/FR titles or AC.',
    'Shape:{"epics":[{"id","name"}],"features":[{"id","name","parentEpicId"}]?,"links":[{"frId","parentEpicId","parentFeatureId?"}]}',
    HIERARCHY_PROMPT_RULES,
    'Rules: every frId from FR_LIST exactly once; parentEpicId = epics[].id or null for root;',
    'epic id stable when possible (EPIC-THEME); epic name = business outcome / multi-capability goal — never "hard tech work";',
    'optional Feature when several FRs share one capability; do not drop FR; do not change FR name.',
    `FR_LIST=${JSON.stringify(frRows)}`,
  ].join('\n');
}

/**
 * @returns {{ ok: true, epics: object[], items: object[] } | { ok: false, errors: string[] }}
 */
function acceptAssignFrEpics(raw, frItems = []) {
  const frOk = new Map();
  for (const row of Array.isArray(frItems) ? frItems : []) {
    const id = normalizeRef(row?.id || row?.logicalId || row?.frId);
    if (id) frOk.set(id, row);
  }
  if (!frOk.size) return { ok: false, errors: ['empty_fr_list'] };
  if (!raw || typeof raw !== 'object') return { ok: false, errors: ['not_object'] };

  const epicsRaw = Array.isArray(raw.epics) ? raw.epics : null;
  const linksRaw = Array.isArray(raw.links) ? raw.links : null;
  if (!epicsRaw) return { ok: false, errors: ['missing_epics'] };
  if (!linksRaw) return { ok: false, errors: ['missing_links'] };

  const epics = [];
  const epicIds = new Set();
  for (let i = 0; i < epicsRaw.length; i += 1) {
    const row = epicsRaw[i];
    if (!row || typeof row !== 'object') return { ok: false, errors: [`epic_${i}_invalid`] };
    const id = normalizeRef(row.id || row.epicId);
    if (!id || !isEpicId(id)) return { ok: false, errors: [`invalid_epic_id_${id || i}`] };
    if (epicIds.has(id)) return { ok: false, errors: [`dup_epic_${id}`] };
    epicIds.add(id);
    epics.push({
      id,
      name: truncate(row.name || row.title || id, NAME_MAX) || id,
      sourceFrIds: [],
      storyIds: [],
    });
  }

  const linkByFr = new Map();
  for (let i = 0; i < linksRaw.length; i += 1) {
    const row = linksRaw[i];
    if (!row || typeof row !== 'object') return { ok: false, errors: [`link_${i}_invalid`] };
    const frId = normalizeRef(row.frId || row.id);
    if (!frId || !frOk.has(frId)) {
      return { ok: false, errors: [`invalid_link_frId_${frId || i}`] };
    }
    if (linkByFr.has(frId)) return { ok: false, errors: [`dup_link_${frId}`] };
    let parentEpicId =
      row.parentEpicId === undefined || row.parentEpicId === null || row.parentEpicId === ''
        ? null
        : normalizeRef(row.parentEpicId);
    if (parentEpicId != null && !epicIds.has(parentEpicId)) {
      return { ok: false, errors: [`orphan_parentEpicId_${frId}`, `received=${parentEpicId}`] };
    }
    linkByFr.set(frId, parentEpicId);
  }

  for (const frId of frOk.keys()) {
    if (!linkByFr.has(frId)) {
      return { ok: false, errors: [`missing_link_${frId}`] };
    }
  }

  const items = [...frOk.entries()].map(([id, row]) => ({
    ...row,
    id,
    logicalId: id,
    parentEpicId: linkByFr.get(id),
  }));

  for (const epic of epics) {
    const kids = items.filter((it) => it.parentEpicId === epic.id);
    if (!kids.length) {
      return { ok: false, errors: [`epic_without_fr_${epic.id}`] };
    }
    epic.sourceFrIds = kids.map((it) => it.id);
    epic.storyIds = kids.map((it) => it.id);
  }

  return { ok: true, epics, items };
}

/**
 * @param {{
 *   proposalItems?: object[],
 *   env?: object,
 *   generateJsonFn?: Function,
 *   localeInstruction?: string,
 * }} opts
 */
async function assignFrEpicsWithLlm(opts = {}) {
  const env = opts.env || process.env;
  const itemsIn = Array.isArray(opts.proposalItems) ? opts.proposalItems : [];
  if (!itemsIn.length) {
    return {
      ok: false,
      items: [],
      epics: [],
      backlogStructure: null,
      meta: { fallbackReason: 'empty_fr_list', reasonCodes: ['empty_fr_list'], llmCalls: 0 },
    };
  }
  if (!isLlmEnabled(env)) {
    return {
      ok: false,
      items: itemsIn,
      epics: [],
      backlogStructure: null,
      meta: {
        fallbackReason: 'AI_PLANNING_LLM_off',
        reasonCodes: ['AI_PLANNING_LLM_off'],
        llmCalls: 0,
      },
    };
  }

  const gen = typeof opts.generateJsonFn === 'function' ? opts.generateJsonFn : generateJson;
  const prompt = buildAssignFrEpicsPrompt({
    frRows: frPayload(itemsIn),
    localeInstruction: opts.localeInstruction || '',
  });
  const t0 = Date.now();
  let llmResult;
  try {
    llmResult = await gen({
      prompt,
      temperature: 0.1,
      env,
    });
  } catch (err) {
    return {
      ok: false,
      items: itemsIn,
      epics: [],
      backlogStructure: null,
      meta: {
        fallbackReason: String(err?.message || err || 'llm_throw'),
        reasonCodes: ['llm_throw'],
        llmCalls: 1,
        llmMs: Date.now() - t0,
      },
    };
  }
  if (!llmResult?.ok || llmResult.data == null) {
    return {
      ok: false,
      items: itemsIn,
      epics: [],
      backlogStructure: null,
      meta: {
        fallbackReason: llmResult?.error || 'llm_failed',
        reasonCodes: [llmResult?.error || 'llm_failed'],
        llmCalls: 1,
        llmMs: Date.now() - t0,
      },
    };
  }

  const accepted = acceptAssignFrEpics(llmResult.data, itemsIn);
  if (!accepted.ok) {
    return {
      ok: false,
      items: itemsIn,
      epics: [],
      backlogStructure: null,
      meta: {
        fallbackReason: (accepted.errors || ['contract_fail']).join(','),
        reasonCodes: accepted.errors || ['contract_fail'],
        llmCalls: 1,
        llmMs: Date.now() - t0,
      },
    };
  }

  const built = await buildBacklogStructureFromFr({
    frItems: accepted.items,
    epicsCatalog: accepted.epics,
    packId: opts.packId || 'pack',
    sourceSnapshotVersion: opts.sourceSnapshotVersion,
    generateJsonFn: opts.generateJsonFn,
    env: opts.env || process.env,
  });
  if (!built.ok) {
    return {
      ok: false,
      items: accepted.items,
      epics: accepted.epics,
      backlogStructure: null,
      meta: {
        fallbackReason: built.code || 'backlog_structure_failed',
        reasonCodes: [built.code || 'backlog_structure_failed'],
        needsReview: Boolean(built.needsReview),
        identityReview: built.identityReview || [],
        llmCalls: 1,
        llmMs: Date.now() - t0,
      },
    };
  }

  return {
    ok: true,
    items: accepted.items,
    epics: accepted.epics,
    backlogStructure: built.backlogStructure,
    meta: {
      source: 'llm_assign_fr_epics',
      backlogSource: 'backlog_structure',
      llmCalls: 1,
      llmMs: Date.now() - t0,
      epicCount: accepted.epics.length,
      frOut: accepted.items.length,
      draftRevisionId: built.draftRevisionId,
    },
  };
}

module.exports = {
  buildAssignFrEpicsPrompt,
  acceptAssignFrEpics,
  assignFrEpicsWithLlm,
};
