/**
 * Phase WHAT — LLM proposes analyzed FR-* from Customer Raw CR intake + Epic map.
 * RULE-FR-01: FR id is never CR-*.
 * RULE-FR-02: each FR cites ≥1 CR in the intake whitelist.
 * RULE-FR-03: flag off / LLM fail → empty, no 1-1 CR dump.
 * RULE-E6: FR content first; epic = grouping label only — never rewrite FR to fit epic.
 * Shape: fr-from-cr-v2 (epics[] + parentEpicId required).
 */

const { generateJson, isLlmEnabled } = require('../runtime/ollamaGenerate');
const {
  FR_FROM_CR_SHAPE_VERSION,
  isWhatFrFromCrFlagOn,
  resolveFrFromCrChunk,
  resolveFrFromCrMaxCr,
  resolveFrFromCrNumCtx,
  resolveFrFromCrTimeoutMs,
  resolveFrFromCrNumPredict,
} = require('../contracts/frFromCrContract');
const {
  reconcileEpicsAcrossChunks,
  deriveBacklogFromFrEpics,
} = require('./deriveBacklogFromFrEpics');

const NAME_MAX = 240;
const DESC_MAX = 800;
const AC_CHARS = 400;

function truncate(text, max) {
  const s = String(text || '').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

function normalizeRef(raw) {
  return String(raw || '').trim();
}

/** Customer Raw CR-* — intake only, never a Gate1 FR id. */
function isCustomerRequirementId(raw) {
  const s = String(raw || '').trim();
  if (!s) return false;
  if (/^(CR)[-_.\s]?\d+/i.test(s)) return true;
  const compact = s.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return /^cr\d+$/i.test(compact);
}

function isProposedFrId(raw) {
  return /^FR[-_.]?\d+/i.test(String(raw || '').trim());
}

function isEpicId(raw) {
  return /^EPIC[-_.]/i.test(String(raw || '').trim());
}

function rowId(row) {
  return normalizeRef(
    row?.externalId || row?.logicalId || row?.id || row?.requirement_identity || row?.frId
  );
}

function shortTitleFromBehavior(text, max = 120) {
  const t = String(text || '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!t) return '';
  if (t.length <= max) return t;
  const slice = t.slice(0, max);
  const br = slice.search(/[.!?…。；;]/);
  if (br >= 40) return slice.slice(0, br + 1).trim();
  const sp = slice.lastIndexOf(' ');
  return `${(sp > 40 ? slice.slice(0, sp) : slice).trim()}…`;
}

function pushCr(out, seen, row, index) {
  const id = rowId(row) || `CR-${index + 1}`;
  if (!isCustomerRequirementId(id) || seen.has(id)) return;
  seen.add(id);
  const behavior = String(row?.functional_behavior || '').trim();
  // Prefer explicit name/title; else short headline from behavior (not full copy into both fields).
  const name = truncate(
    row?.name || row?.title || shortTitleFromBehavior(behavior, 80) || id,
    NAME_MAX
  );
  const explicitDesc = String(row?.description || row?.text || '').trim();
  const description = truncate(
    explicitDesc ||
      (behavior && behavior.length > String(name).length ? behavior : ''),
    DESC_MAX
  );
  const ac = truncate(row?.acceptanceCriteria || row?.ac || row?.acceptance_condition || '', AC_CHARS);
  const item = {
    id,
    name,
    description: description || undefined,
    ac: ac || undefined,
    actor: truncate(row?.actor || '', 80) || undefined,
    priority: truncate(row?.priority || '', 40) || undefined,
  };
  if (!item.description) delete item.description;
  if (!item.ac) delete item.ac;
  if (!item.actor) delete item.actor;
  if (!item.priority) delete item.priority;
  out.push(item);
}

/**
 * CR whitelist for prompt + accept.
 * @param {object} pack
 * @param {object} [snapshot]
 * @param {NodeJS.ProcessEnv} [env]
 */
function listCustomerRawIntake(pack = {}, snapshot = null, env = process.env) {
  const max = resolveFrFromCrMaxCr(env);
  const out = [];
  const seen = new Set();

  const lists = [
    pack?.aiAnalysis?.customerRawRows?.requirements,
    pack?.aiAnalysis?.customerRawRows?.functionalRequirements,
    pack?.functionalRequirements,
    pack?.frList,
    snapshot?.functionalRequirements,
    snapshot?.projected?.srs?.functionalRequirements,
  ];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (let i = 0; i < list.length && out.length < max; i += 1) {
      pushCr(out, seen, list[i], i);
    }
  }

  if (!out.length && (snapshot?.canonicalRaw || pack?.aiAnalysis?.canonicalRaw)) {
    try {
      const { resolveFrListForG4 } = require('../semantic/sectionInputContract');
      const rows = resolveFrListForG4(snapshot || {}, pack);
      for (let i = 0; i < rows.length && out.length < max; i += 1) {
        pushCr(out, seen, rows[i], i);
      }
    } catch {
      /* intake stays empty */
    }
  }

  return out;
}

function buildFrFromCrPrompt({ crRows = [], localeInstruction = '' } = {}) {
  const payload = crRows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    ac: r.ac,
    actor: r.actor,
    priority: r.priority,
  }));
  return [
    localeInstruction || 'Respond in the same language as CR titles.',
    'Propose FR+Epic JSON only. No prose. No CR ids as FR id.',
    'Shape:{"epics":[{"id","name"}],"nodes":[{"id","name","description?","ac","priority","sourceCrIds","parentEpicId"}]}',
    'RULE-E6 (dual-duty): (1) Prioritize correct CR→FR split + AC; keep FR name/description faithful to CR behavior.',
    '(2) Epic is ONLY a grouping label for shared outcome — do NOT rewrite FR name/AC to fit an epic; do NOT drop an FR because grouping is hard.',
    'Rules: id = FR-n unique within this chunk; sourceCrIds exact CR ids from CR_INTAKE and non-empty;',
    'split independent behaviors (do NOT copy 1 CR = 1 FR when one CR states several behaviors); never copy CR id as FR id; no NFR-only items;',
    'name = short title; description = fuller behavior (do not set description identical to name).',
    'Epic: use stable epicId when possible (e.g. EPIC-IOT), not only EPIC-1 sequential; parentEpicId must reference epics[].id or null for intentional root Story.',
    'Every epic must cover ≥1 FR via parentEpicId. Do not invent Story text — Story will be derived from FR.',
    `CR_INTAKE=${JSON.stringify(payload)}`,
  ].join('\n');
}

/**
 * Accept FR+epic (fr-from-cr-v2). Fail-closed on missing/orphan parentEpicId / empty epic.
 * RULE-E6: never rewrite FR name from epic.
 * @returns {{ ok: true, items: object[], epics: object[] } | { ok: false, errors: string[] }}
 */
function acceptFrFromCr(raw, crWhitelist = []) {
  const whitelist = new Set(
    (Array.isArray(crWhitelist) ? crWhitelist : [])
      .map((r) => normalizeRef(r?.id || r))
      .filter(Boolean)
  );
  if (!whitelist.size) return { ok: false, errors: ['empty_cr_whitelist'] };
  if (!raw || typeof raw !== 'object') return { ok: false, errors: ['not_object'] };

  const list = Array.isArray(raw.nodes)
    ? raw.nodes
    : Array.isArray(raw.items)
      ? raw.items
      : null;
  if (!list) return { ok: false, errors: ['missing_nodes'] };
  if (!list.length) return { ok: true, items: [], epics: [] };

  const epicsRaw = Array.isArray(raw.epics) ? raw.epics : null;
  if (!epicsRaw) {
    return { ok: false, errors: ['missing_epics', 'fr-from-cr-v2_required'] };
  }

  const epics = [];
  const epicIds = new Set();
  for (let i = 0; i < epicsRaw.length; i += 1) {
    const row = epicsRaw[i];
    if (!row || typeof row !== 'object') {
      return { ok: false, errors: [`epic_${i}_invalid`] };
    }
    const id = normalizeRef(row.id || row.epicId);
    if (!id) return { ok: false, errors: [`epic_${i}_missing_id`] };
    if (!isEpicId(id)) {
      return { ok: false, errors: [`invalid_epic_id_${id}`] };
    }
    if (epicIds.has(id)) return { ok: false, errors: [`dup_epic_${id}`] };
    epicIds.add(id);
    epics.push({
      id,
      name: truncate(row.name || row.title || id, NAME_MAX) || id,
      description: truncate(row.description || row.goal || '', DESC_MAX) || undefined,
      sourceFrIds: [],
      storyIds: [],
    });
    if (!epics[epics.length - 1].description) delete epics[epics.length - 1].description;
  }

  const items = [];
  const seen = new Set();
  for (let i = 0; i < list.length; i += 1) {
    const row = list[i];
    if (!row || typeof row !== 'object') return { ok: false, errors: [`row_${i}_invalid`] };
    const id = normalizeRef(row.id || row.logicalId || row.frId);
    if (!id) return { ok: false, errors: [`row_${i}_missing_id`] };
    if (isCustomerRequirementId(id) || !isProposedFrId(id)) {
      return { ok: false, errors: [`invalid_fr_id_${id}`, 'expected_FR'] };
    }
    if (seen.has(id)) return { ok: false, errors: [`dup_id_${id}`] };
    seen.add(id);

    const sourceCrIds = (Array.isArray(row.sourceCrIds) ? row.sourceCrIds : [])
      .map(normalizeRef)
      .filter(Boolean);
    if (!sourceCrIds.length) {
      return { ok: false, errors: [`missing_sourceCrIds_${id}`] };
    }
    for (const cr of sourceCrIds) {
      if (!whitelist.has(cr)) {
        return { ok: false, errors: [`invalid_sourceCrId_${id}`, `received=${cr}`] };
      }
    }

    // Fail-closed: parentEpicId key required (null = intentional root).
    if (!Object.prototype.hasOwnProperty.call(row, 'parentEpicId')) {
      return { ok: false, errors: [`missing_parentEpicId_${id}`] };
    }
    let parentEpicId =
      row.parentEpicId === undefined || row.parentEpicId === null || row.parentEpicId === ''
        ? null
        : normalizeRef(row.parentEpicId);
    if (parentEpicId != null && !epicIds.has(parentEpicId)) {
      return {
        ok: false,
        errors: [`orphan_parentEpicId_${id}`, `received=${parentEpicId}`],
      };
    }

    // RULE-E6 / R3: accept FR name as-is — never rewrite from epic.
    const name = truncate(row.name || row.title || id, NAME_MAX);
    let priority = truncate(row.priority || '', 40);
    if (!priority) {
      const fromCr = [
        ...new Set(
          sourceCrIds
            .map((crId) => crWhitelist.find((cr) => normalizeRef(cr?.id) === crId))
            .map((cr) => truncate(cr?.priority || '', 40))
            .filter(Boolean)
        ),
      ];
      if (fromCr.length === 1) priority = fromCr[0];
    }
    items.push({
      id,
      logicalId: id,
      title: name,
      name,
      description: truncate(row.description || '', DESC_MAX),
      ac: truncate(row.ac || row.acceptanceCriteria || '', AC_CHARS),
      acceptanceCriteria: truncate(row.ac || row.acceptanceCriteria || '', AC_CHARS),
      priority: priority || undefined,
      parentEpicId,
      sourceCrIds,
      sourceRefs: sourceCrIds.map((cr) => ({ type: 'customer_raw', id: cr })),
      origin: { type: 'AI_SYNTHESIS', engine: 'fr_from_cr', section: 'functionalRequirements' },
      provenance: {
        type: 'AI_SYNTHESIS',
        derivedFrom: sourceCrIds,
        rule: 'CR_TO_FR',
        producer: 'semantic_runtime',
      },
      status: 'PROPOSED',
    });
  }

  // RULE-E3: every epic must have ≥1 FR
  for (const epic of epics) {
    const kids = items.filter((it) => it.parentEpicId === epic.id);
    if (!kids.length) {
      return { ok: false, errors: [`epic_without_fr_${epic.id}`] };
    }
    epic.sourceFrIds = kids.map((it) => it.id);
    epic.storyIds = kids.map((it) => it.id);
  }

  return { ok: true, items, epics };
}

function renumberProposedFr(items = []) {
  return items.map((row, i) => {
    const id = `FR-${i + 1}`;
    return { ...row, id, logicalId: id };
  });
}

/**
 * Proposed FR-* is the Gate1 list. G4 may still emit CR ids when it resumes
 * a prefix built before the overlay; those rows must not replace the proposal.
 * @param {object[]} proposedItems
 * @param {object[]} g4Requirements
 */
function mergeProposedFrRequirements(proposedItems = [], g4Requirements = []) {
  const g4ById = new Map();
  for (const row of Array.isArray(g4Requirements) ? g4Requirements : []) {
    const id = String(row?.id || row?.frId || '').trim();
    if (id) g4ById.set(id, row);
  }
  return (Array.isArray(proposedItems) ? proposedItems : [])
    .map((src) => {
      const id = String(src?.id || src?.logicalId || '').trim();
      if (!id || isCustomerRequirementId(id)) return null;
      const g4 = g4ById.get(id) || {};
      const sourceCrIds = Array.isArray(src?.sourceCrIds)
        ? src.sourceCrIds.map((x) => String(x || '').trim()).filter(Boolean)
        : [];
      const parentEpicId =
        src?.parentEpicId === undefined || src?.parentEpicId === null || src?.parentEpicId === ''
          ? src?.parentEpicId === null
            ? null
            : g4.parentEpicId != null
              ? g4.parentEpicId
              : undefined
          : String(src.parentEpicId).trim();
      const out = {
        ...g4,
        ...src,
        id,
        frId: id,
        logicalId: id,
        title: src?.title || src?.name || g4.title || id,
        name: src?.name || src?.title || g4.title || id,
        description: src?.description || g4.description || '',
        ac: src?.ac || src?.acceptanceCriteria || g4.ac || '',
        acceptanceCriteria: src?.acceptanceCriteria || src?.ac || g4.ac || '',
        sourceCrIds,
        sourceRefs: Array.isArray(src?.sourceRefs) && src.sourceRefs.length
          ? src.sourceRefs
          : sourceCrIds.map((cr) => ({ type: 'customer_raw', id: cr })),
      };
      if (parentEpicId !== undefined) out.parentEpicId = parentEpicId;
      return out;
    })
    .filter(Boolean);
}

function failMeta(reason, extra = {}) {
  return {
    ok: false,
    items: [],
    epics: [],
    backlogStructure: null,
    meta: {
      source: 'llm_failed',
      fallbackReason: reason,
      reasonCodes: [reason],
      shapeVersion: FR_FROM_CR_SHAPE_VERSION,
      llmCalls: 0,
      ...extra,
    },
  };
}

/**
 * @param {{ pack?: object, snapshot?: object, env?: object, generateJsonFn?: Function }} opts
 */
async function proposeFrFromCrWithLlm(opts = {}) {
  const env = opts.env || process.env;
  const pack = opts.pack || {};
  const snapshot = opts.snapshot || null;

  if (!isWhatFrFromCrFlagOn(env)) {
    return failMeta('WHAT_FR_FROM_CR_off');
  }
  if (!isLlmEnabled(env)) {
    return failMeta('AI_PLANNING_LLM_off');
  }

  const crRows = listCustomerRawIntake(pack, snapshot, env);
  if (!crRows.length) {
    return failMeta('empty_cr_intake');
  }

  const chunkSize = resolveFrFromCrChunk(env);
  const chunks = [];
  for (let i = 0; i < crRows.length; i += chunkSize) {
    chunks.push(crRows.slice(i, i + chunkSize));
  }

  let localeInstruction = '';
  try {
    const {
      normalizeDeriveLocale,
      languageInstruction: langFn,
    } = require('../semantic/buildSemanticDeriveContext');
    localeInstruction = langFn(
      normalizeDeriveLocale(pack?.aiAnalysis?.deriveLocale || pack?.locale || env.PHASE1_DERIVE_LOCALE)
    );
  } catch {
    localeInstruction = '';
  }

  const gen = typeof opts.generateJsonFn === 'function' ? opts.generateJsonFn : generateJson;
  /** @type {{ epics: object[], items: object[] }[]} */
  const chunkResults = [];
  let llmCalls = 0;
  const t0 = Date.now();

  for (let ci = 0; ci < chunks.length; ci += 1) {
    const prompt = buildFrFromCrPrompt({ crRows: chunks[ci], localeInstruction });
    let llmResult;
    try {
      llmResult = await gen({
        prompt,
        numPredict: resolveFrFromCrNumPredict(env),
        numCtx: resolveFrFromCrNumCtx(env),
        timeoutMs: resolveFrFromCrTimeoutMs(env),
        temperature: 0.1,
        env,
      });
    } catch (err) {
      return failMeta(String(err?.message || err || 'llm_throw'), {
        reasonCodes: ['llm_throw', `chunk_${ci}`],
        llmCalls: llmCalls + 1,
        llmMs: Date.now() - t0,
      });
    }
    llmCalls += 1;
    if (!llmResult?.ok || llmResult.data == null) {
      return failMeta(llmResult?.error || 'llm_failed', {
        reasonCodes: [llmResult?.error || 'llm_failed', `chunk_${ci}`],
        llmCalls,
        llmMs: Date.now() - t0,
      });
    }
    const accepted = acceptFrFromCr(llmResult.data, chunks[ci]);
    if (!accepted.ok) {
      return failMeta((accepted.errors || ['contract_fail']).join(','), {
        reasonCodes: [...(accepted.errors || ['contract_fail']), `chunk_${ci}`],
        llmCalls,
        llmMs: Date.now() - t0,
      });
    }
    const prefixedItems = accepted.items.map((item) => ({
      ...item,
      id: `c${ci}-${item.id}`,
      logicalId: `c${ci}-${item.id}`,
    }));
    // Prefix epic ids per chunk so identical EPIC-1 across chunks stay distinct until reconcile-by-name.
    const epicIdLocalRemap = {};
    const prefixedEpics = (accepted.epics || []).map((epic) => {
      const nextId = `c${ci}-${epic.id}`;
      epicIdLocalRemap[epic.id] = nextId;
      return {
        ...epic,
        id: nextId,
        sourceFrIds: (epic.sourceFrIds || []).map((fr) => `c${ci}-${fr}`),
        storyIds: (epic.storyIds || []).map((fr) => `c${ci}-${fr}`),
      };
    });
    for (const item of prefixedItems) {
      if (item.parentEpicId && epicIdLocalRemap[item.parentEpicId]) {
        item.parentEpicId = epicIdLocalRemap[item.parentEpicId];
      }
    }
    chunkResults.push({ epics: prefixedEpics, items: prefixedItems });
  }

  const reconciled = reconcileEpicsAcrossChunks(chunkResults);
  const items = renumberProposedFr(reconciled.items);
  if (!items.length) {
    return failMeta('missing_proposed_fr', {
      llmCalls,
      llmMs: Date.now() - t0,
      crIn: crRows.length,
    });
  }

  // Remap epic.sourceFrIds / storyIds to renumbered FR ids via old→new from renumber.
  // renumberProposedFr only changes id; track via index on reconciled.items.
  const oldToNew = new Map();
  for (let i = 0; i < reconciled.items.length; i += 1) {
    oldToNew.set(reconciled.items[i].id, items[i].id);
  }
  const epics = reconciled.epics.map((epic) => ({
    ...epic,
    sourceFrIds: (epic.sourceFrIds || [])
      .map((id) => oldToNew.get(id) || id)
      .filter(Boolean),
    storyIds: (epic.storyIds || []).map((id) => oldToNew.get(id) || id).filter(Boolean),
  }));

  const derived = deriveBacklogFromFrEpics(items, epics, {
    backlogSource: 'derived_from_fr_epic',
  });
  if (!derived.ok) {
    return failMeta((derived.errors || ['derive_fail']).join(','), {
      reasonCodes: [...(derived.errors || ['derive_fail'])],
      llmCalls,
      llmMs: Date.now() - t0,
      epicReconcileMerged: reconciled.epicReconcileMerged,
    });
  }

  console.info(
    `[fr-from-cr] crIn=${crRows.length} frOut=${items.length} epics=${epics.length} llmCalls=${llmCalls} epicMerged=${reconciled.epicReconcileMerged}`
  );
  return {
    ok: true,
    items,
    epics,
    backlogStructure: derived.backlogStructure,
    meta: {
      source: 'llm_fr_from_cr',
      shapeVersion: FR_FROM_CR_SHAPE_VERSION,
      backlogSource: 'derived_from_fr_epic',
      crIn: crRows.length,
      frOut: items.length,
      epicCount: epics.length,
      llmCalls,
      llmMs: Date.now() - t0,
      chunks: chunks.length,
      epicReconcileMerged: reconciled.epicReconcileMerged,
    },
  };
}

function stripCanonicalRaw(host) {
  if (!host || typeof host !== 'object') return host;
  const next = { ...host };
  delete next.canonicalRaw;
  if (next.aiAnalysis && typeof next.aiAnalysis === 'object') {
    const ai = { ...next.aiAnalysis };
    delete ai.canonicalRaw;
    next.aiAnalysis = ai;
  }
  return next;
}

/** Snapshot/pack overlay so G4 reads FR-* instead of canonical CR. */
function overlayAnalyzedFr(snapshot, pack, items = []) {
  const frs = items.map((row) => ({
    id: row.id,
    externalId: row.id,
    logicalId: row.id,
    title: row.title || row.name,
    name: row.name || row.title,
    description: row.description || '',
    ac: row.ac || row.acceptanceCriteria || '',
    acceptanceCriteria: row.acceptanceCriteria || row.ac || '',
    sourceCrIds: Array.isArray(row.sourceCrIds) ? [...row.sourceCrIds] : [],
    parentEpicId:
      row.parentEpicId === undefined || row.parentEpicId === null || row.parentEpicId === ''
        ? row.parentEpicId === null
          ? null
          : undefined
        : String(row.parentEpicId).trim(),
    level: 'Requirement',
  }));
  for (const fr of frs) {
    if (fr.parentEpicId === undefined) delete fr.parentEpicId;
  }
  const nextSnap = stripCanonicalRaw(snapshot);
  nextSnap.functionalRequirements = frs;
  if (nextSnap.projected?.srs) {
    nextSnap.projected = {
      ...nextSnap.projected,
      srs: { ...nextSnap.projected.srs, functionalRequirements: frs },
    };
  }
  const nextPack = stripCanonicalRaw(pack);
  nextPack.functionalRequirements = frs;
  if (nextPack.projected?.srs) {
    nextPack.projected = {
      ...nextPack.projected,
      srs: { ...nextPack.projected.srs, functionalRequirements: frs },
    };
  }
  return { snapshot: nextSnap, pack: nextPack };
}

module.exports = {
  isCustomerRequirementId,
  isProposedFrId,
  listCustomerRawIntake,
  buildFrFromCrPrompt,
  acceptFrFromCr,
  proposeFrFromCrWithLlm,
  overlayAnalyzedFr,
  renumberProposedFr,
  mergeProposedFrRequirements,
  reconcileEpicsAcrossChunks,
};
