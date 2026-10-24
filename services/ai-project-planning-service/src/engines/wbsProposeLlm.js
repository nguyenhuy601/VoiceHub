/**
 * WBS LLM propose — task leaves under Gate1-approved Stories (SoT) + semantic.
 * Input: stories (+ epics for materialize) + semantic. No FR-unit invent / G7 CTX.
 */

const { generateJson, isLlmEnabled } = require('../runtime/ollamaGenerate');
const { cachedGenerateJson } = require('../artifacts/cachedGenerateJson');
const {
  isHowWbsLlmFlagOn,
  resolveWbsLlmNumPredict,
  resolveWbsLlmNumCtx,
  resolveWbsLlmTimeoutMs,
  planWbsCallSlices,
} = require('../contracts/howWbsLlmContract');
const { roleKeyForArea } = require('./wbsAgileNaming');
const {
  isKnownProjectRole,
  resolveAllowedProjectRoleKey,
  canonicalizeProjectRoleKey,
  roleEnumHintFromAllowList,
} = require('./roleKey');

const AREA_ENUM = Object.freeze([
  'frontend',
  'backend',
  'qa',
  'design',
  'infra',
  'infrastructure',
]);

const UNIT_NAME_MAX = 240;
const UNIT_DESC_MAX = 2400;
const UNIT_AC_MAX = 24;
const UNIT_AC_CHARS = 360;
const UNIT_FR_MAX = 16;
const UNIT_SCOPE_MAX = 80;

const DELIVERABLE_MIN_LEN = 8;

const ROLE_ENUM_HINT =
  'frontend_developer|backend_developer|qa_engineer|ui_ux_designer|devops_engineer|business_analyst|technical_lead|project_manager';

function truncate(text, max) {
  const s = String(text || '').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

function normalizeRef(raw) {
  return String(raw || '').trim();
}

function unitWhitelist(units = []) {
  return new Set(
    (Array.isArray(units) ? units : [])
      .map((u) => String(u?.id || '').trim())
      .filter(Boolean)
  );
}

function unitMapById(units = []) {
  const map = new Map();
  for (const u of units || []) {
    const id = normalizeRef(u?.id);
    if (id) map.set(id, u);
  }
  return map;
}

function unitAcList(unit) {
  const raw = Array.isArray(unit?.ac)
    ? unit.ac
    : Array.isArray(unit?.acRefs)
      ? unit.acRefs
      : [];
  return raw
    .slice(0, UNIT_AC_MAX)
    .map((a) => truncate(a, UNIT_AC_CHARS))
    .filter(Boolean);
}

function unitAcWhitelist(unit) {
  return new Set(unitAcList(unit));
}

function normalizeAcKey(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/[.…]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

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

function unitFrWhitelist(unit) {
  const frs = Array.isArray(unit?.fr)
    ? unit.fr
    : Array.isArray(unit?.sourceFrIds)
      ? unit.sourceFrIds
      : [];
  return new Set(
    frs
      .slice(0, UNIT_FR_MAX)
      .map((x) => normalizeRef(x))
      .filter(Boolean)
  );
}

function isCustomerRequirementId(raw) {
  const s = String(raw || '').trim();
  if (!s) return false;
  if (/^(CR)[-_.\s]?\d+/i.test(s)) return true;
  const compact = s.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return /^cr\d+$/i.test(compact);
}

/** Normalize story rows for accept/prompt (id, fr, ac, uc). */
function normalizeStoriesForWbs(stories = []) {
  return (Array.isArray(stories) ? stories : [])
    .map((s) => ({
      id: normalizeRef(s?.id),
      name: s?.name || s?.id,
      description: s?.description || '',
      fr: Array.isArray(s?.fr)
        ? s.fr.map(normalizeRef).filter(Boolean)
        : Array.isArray(s?.sourceFrIds)
          ? s.sourceFrIds.map(normalizeRef).filter(Boolean)
          : [],
      ac: Array.isArray(s?.ac)
        ? s.ac
        : Array.isArray(s?.acRefs)
          ? s.acRefs
          : [],
      uc: Array.isArray(s?.uc)
        ? s.uc.map(normalizeRef).filter(Boolean)
        : Array.isArray(s?.sourceUcIds)
          ? s.sourceUcIds.map(normalizeRef).filter(Boolean)
          : [],
      module: truncate(s?.module || s?.moduleName || '', UNIT_SCOPE_MAX) || undefined,
      feature: truncate(s?.feature || s?.featureName || '', UNIT_SCOPE_MAX) || undefined,
      parentId: s?.parentId ?? s?.parentEpicId ?? null,
    }))
    .filter((s) => s.id);
}

const AREA_DELIVERABLE_HINT = Object.freeze({
  frontend: 'UI screen/component + interaction test evidence',
  backend: 'Service/API endpoint + unit test evidence',
  api: 'API contract + integration test evidence',
  qa: 'Test cases executed + evidence log',
  design: 'UX spec/wireframe artifact',
  infra: 'Infra config/runbook artifact',
  infrastructure: 'Infra config/runbook artifact',
  database: 'Schema/migration + verification',
});

function resolveLeafDeliverable(row, { taskName, unitTitle, acRefs = [], area = '' } = {}) {
  const fromLlm = String(row?.deliverable || row?.output || row?.doneWhen || '').trim();
  if (fromLlm.length >= DELIVERABLE_MIN_LEN) return fromLlm;
  for (const ac of acRefs) {
    const text = String(ac || '').trim();
    if (text.length < DELIVERABLE_MIN_LEN) continue;
    if (normalizeAcKey(text) === normalizeAcKey(taskName)) continue;
    if (unitTitle && normalizeAcKey(text) === normalizeAcKey(unitTitle)) continue;
    return text.slice(0, 240);
  }
  const areaKey = String(area || row?.area || 'backend').toLowerCase();
  const hint = AREA_DELIVERABLE_HINT[areaKey] || 'Implementation artifact + verification evidence';
  const candidate = `${hint} (${String(taskName || '').slice(0, 80)})`.trim();
  if (candidate.length >= DELIVERABLE_MIN_LEN) return candidate.slice(0, 240);
  return hint;
}

function resolveLeafSuggestedRole(row, area, allowList) {
  const raw = canonicalizeProjectRoleKey(
    row?.suggestedRoleKey || row?.roleKey || row?.role
  );
  const areaFallback = roleKeyForArea(area || 'backend');
  const opts = { allowList, fallback: areaFallback };
  if (raw && isKnownProjectRole(raw, allowList)) {
    return resolveAllowedProjectRoleKey(raw, opts);
  }
  return resolveAllowedProjectRoleKey(areaFallback, {
    allowList,
    fallback: 'backend_developer',
  });
}

/**
 * FR work units for WBS. Story that cites the FR wins; otherwise the Epic that lists it.
 * AC stays on the unit only when the story cites that single FR.
 * @param {object[]} stories
 * @param {object[]} epics
 * @param {object|null} semantic
 */
function collectFrUnits(stories = [], epics = [], semantic = null) {
  const storyList = normalizeStoriesForWbs(stories);
  const frMeta = new Map();
  const approved = Array.isArray(semantic?.approved?.fr) ? semantic.approved.fr : [];
  for (const row of approved) {
    const id = normalizeRef(row?.id);
    if (id) frMeta.set(id, row);
  }

  /** @type {Map<string, object>} */
  const byId = new Map();
  const order = [];

  function touch(frId, anchor) {
    const id = normalizeRef(frId);
    if (!id || isCustomerRequirementId(id)) return;
    const prev = byId.get(id);
    if (prev) {
      if (!prev.storyId && anchor.storyId) {
        prev.storyId = anchor.storyId;
        prev.epicId = anchor.epicId || prev.epicId;
        prev.parentId = anchor.storyId;
        if (anchor.ac?.length) prev.ac = anchor.ac;
        if (anchor.description) prev.description = anchor.description;
        if (anchor.module) prev.module = anchor.module;
        if (anchor.feature) prev.feature = anchor.feature;
      }
      return;
    }
    const meta = frMeta.get(id) || {};
    const name =
      truncate(meta.statement || meta.name || anchor.name || id, UNIT_NAME_MAX) || id;
    byId.set(id, {
      id,
      name,
      description: anchor.description || '',
      statement: meta.statement || anchor.description || '',
      ac: Array.isArray(anchor.ac) ? anchor.ac : [],
      module: anchor.module || meta.module || undefined,
      feature: anchor.feature || meta.feature || undefined,
      storyId: anchor.storyId || null,
      epicId: anchor.epicId || null,
      parentId: anchor.storyId || anchor.epicId || null,
    });
    order.push(id);
  }

  for (const story of storyList) {
    const single = story.fr.length === 1;
    for (const frId of story.fr) {
      touch(frId, {
        storyId: story.id,
        epicId: normalizeRef(story.parentId) || null,
        name: story.name,
        description: story.description || '',
        ac: single ? story.ac : [],
        module: story.module,
        feature: story.feature,
      });
    }
  }
  for (const epic of Array.isArray(epics) ? epics : []) {
    const epicId = normalizeRef(epic?.id);
    if (!epicId) continue;
    const frs = Array.isArray(epic.sourceFrIds)
      ? epic.sourceFrIds
      : Array.isArray(epic.fr)
        ? epic.fr
        : [];
    for (const frId of frs) {
      touch(frId, {
        storyId: null,
        epicId,
        name: epic.name || epicId,
        description: epic.description || '',
        ac: [],
        module: epic.module,
        feature: epic.feature,
      });
    }
  }

  return order.map((id) => byId.get(id));
}

/**
 * Strict accept — each task cites exactly one approved FR.
 * Parent Epic/Story is assigned later from that FR's Gate1 anchor.
 * @returns {{ ok: true, tasks: object[] } | { ok: false, errors: string[] }}
 */
function acceptWbsStoryTasks(raw, storiesIn = [], opts = {}) {
  const stories = normalizeStoriesForWbs(
    Array.isArray(storiesIn)
      ? storiesIn
      : Array.isArray(storiesIn?.stories)
        ? storiesIn.stories
        : Array.isArray(storiesIn?.units)
          ? storiesIn.units
          : []
  );
  const frUnits =
    Array.isArray(opts.frUnits) && opts.frUnits.length
      ? opts.frUnits
      : collectFrUnits(stories, opts.epics || [], opts.semantic || null);
  if (!raw || typeof raw !== 'object') {
    return { ok: false, errors: ['not_object'] };
  }
  const list = Array.isArray(raw.nodes)
    ? raw.nodes
    : Array.isArray(raw.tasks)
      ? raw.tasks
      : null;
  if (!list) return { ok: false, errors: ['missing_nodes'] };

  const frById = new Map(frUnits.filter((unit) => unit?.id).map((unit) => [unit.id, unit]));
  if (!frById.size) return { ok: false, errors: ['empty_fr_whitelist'] };

  if (opts.requireChunkEnvelope) {
    const echoed = Array.isArray(raw.chunkFrIds) ? raw.chunkFrIds : null;
    if (!echoed) return { ok: false, errors: ['missing_chunkFrIds'] };
    const got = [...new Set(echoed.map((id) => normalizeRef(id)).filter(Boolean))].sort();
    const expected = [...frById.keys()].sort();
    if (got.length !== expected.length || got.some((id, index) => id !== expected[index])) {
      return {
        ok: false,
        errors: [
          'chunk_fr_ids_mismatch',
          `expected=${expected.join('|')}`,
          `received=${got.join('|')}`,
        ],
      };
    }
  }

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

    const sourceFrIds = Array.isArray(row.sourceFrIds)
      ? row.sourceFrIds.map((x) => normalizeRef(x)).filter(Boolean)
      : [];
    if (sourceFrIds.length !== 1) {
      return {
        ok: false,
        errors: [
          sourceFrIds.length ? `expected_one_fr_${id}` : `missing_sourceFrIds_${id}`,
        ],
      };
    }
    const frId = sourceFrIds[0];
    if (isCustomerRequirementId(frId)) {
      return { ok: false, errors: [`story_cr_fr_${id}`, `received=${frId}`] };
    }
    const frUnit = frById.get(frId);
    if (!frUnit) {
      return {
        ok: false,
        errors: [
          `invalid_sourceFrId_${id}`,
          `received=${frId}`,
          `whitelist=${[...frById.keys()].slice(0, 12).join('|')}`,
        ],
      };
    }
    const acOk = new Set(
      (Array.isArray(frUnit.ac) ? frUnit.ac : [])
        .map((x) => normalizeRef(x))
        .filter(Boolean)
    );
    const parentStoryId = frUnit.storyId || null;

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
    const storyTitle = String(frUnit.name || '').trim();
    let deliverable = resolveLeafDeliverable(row, {
      taskName,
      unitTitle: storyTitle,
      acRefs,
      area,
    });
    if (
      deliverable &&
      (normalizeAcKey(deliverable) === normalizeAcKey(taskName) ||
        (storyTitle && normalizeAcKey(deliverable) === normalizeAcKey(storyTitle)))
    ) {
      deliverable = resolveLeafDeliverable(
        { area, deliverable: '' },
        { taskName: `${taskName} · out`, unitTitle: storyTitle, acRefs: [], area }
      );
    }
    if (!deliverable || deliverable.length < DELIVERABLE_MIN_LEN) {
      continue;
    }

    const rawSeed = row.effortSeedHours ?? row.effortHours;
    let effortSeedHours;
    if (rawSeed !== undefined && rawSeed !== null && String(rawSeed).trim() !== '') {
      const effort = Number(rawSeed);
      if (!Number.isFinite(effort) || effort <= 0) {
        continue;
      }
      effortSeedHours = effort;
    }

    const suggestedRoleKey = resolveLeafSuggestedRole(row, area, opts.roleAllowList);

    const task = {
      id,
      name: taskName,
      parentId: parentStoryId || frUnit.epicId || null,
      parentStoryId,
      parentEpicId: frUnit.epicId || null,
      level: 'task',
      area: area || 'backend',
      sourceFrIds: [frId],
      acRefs,
      deliverable,
      suggestedRoleKey,
      sortOrder: Number.isFinite(Number(row.sortOrder)) ? Number(row.sortOrder) : i,
    };
    if (effortSeedHours != null) task.effortSeedHours = effortSeedHours;
    tasks.push(task);
  }

  return { ok: true, tasks };
}

function reportUnitTaskPresence(tasks, units = []) {
  const need = (Array.isArray(units) ? units : []).filter((u) => u && u.id);
  const covered = new Set();
  for (const t of tasks || []) {
    const pid = normalizeRef(t.parentStoryId || t.parentId || t.parentUnitId);
    if (pid) covered.add(pid);
  }
  const unresolvedUnitIds = need
    .filter((u) => !covered.has(String(u.id)))
    .map((u) => String(u.id));
  return { ok: true, unresolvedUnitIds, unresolvedStoryIds: unresolvedUnitIds };
}

function reportStoryTaskPresence(tasks, stories = []) {
  return reportUnitTaskPresence(tasks, stories);
}

function assertStoryTaskCoverage(tasks, stories = []) {
  return reportUnitTaskPresence(tasks, stories);
}

function assertFrAcCoverage(tasks, units = []) {
  const uncoveredFrIds = [];
  const uncoveredAcKeys = [];
  const leavesByUnit = new Map();
  for (const t of tasks || []) {
    const pid = normalizeRef(t.parentStoryId || t.parentId || t.parentUnitId);
    if (!pid) continue;
    if (!leavesByUnit.has(pid)) leavesByUnit.set(pid, []);
    leavesByUnit.get(pid).push(t);
  }

  for (const unit of Array.isArray(units) ? units : []) {
    if (!unit || !unit.id) continue;
    const uid = String(unit.id);
    const leaves = leavesByUnit.get(uid);
    if (!leaves || !leaves.length) continue;

    const citedFr = new Set();
    const citedAc = new Set();
    for (const leaf of leaves) {
      for (const fr of leaf.sourceFrIds || []) citedFr.add(normalizeRef(fr));
      for (const ac of leaf.acRefs || []) citedAc.add(normalizeRef(ac));
    }

    for (const fr of unitFrWhitelist(unit)) {
      if (!citedFr.has(fr)) uncoveredFrIds.push(`${uid}:${fr}`);
    }
    const citedAcList = [];
    for (const leaf of leaves) {
      for (const ac of leaf.acRefs || []) citedAcList.push(ac);
    }
    for (const ac of unitAcWhitelist(unit)) {
      if (!acCitationCoversWhitelist(ac, citedAcList)) {
        uncoveredAcKeys.push(`${uid}:${ac}`);
      }
    }
  }

  return { uncoveredFrIds, uncoveredAcKeys };
}

function resolveDecompositionOutcome({
  leafCount = 0,
  unresolvedUnitIds = [],
  unresolvedStoryIds = [],
  uncoveredFrIds = [],
  uncoveredAcKeys = [],
}) {
  const unresolved = unresolvedUnitIds.length
    ? unresolvedUnitIds
    : unresolvedStoryIds;
  if (leafCount <= 0) return 'partial';
  if (unresolved.length > 0 || uncoveredFrIds.length > 0 || uncoveredAcKeys.length > 0) {
    return 'partial';
  }
  return 'success';
}

/**
 * Production prompt — one call decomposes approved FR rows into task leaves.
 * Feature nodes are not requested from the model; ≥2 tasks on one FR are promoted later.
 */
function buildWbsStoryLlmPrompt({
  stories = [],
  units = [],
  frUnits = null,
  epics = [],
  semantic = null,
  localeInstruction = '',
  roleAllowList = null,
} = {}) {
  const list = normalizeStoriesForWbs(
    Array.isArray(stories) && stories.length ? stories : units
  );
  const frList =
    Array.isArray(frUnits) && frUnits.length
      ? frUnits
      : collectFrUnits(list, epics, semantic);
  const chunkFrIds = frList.map((unit) => unit.id).filter(Boolean);
  const factsByFr = new Map();
  for (const row of Array.isArray(semantic?.approved?.fr) ? semantic.approved.fr : []) {
    const id = normalizeRef(row?.id);
    if (!id || !chunkFrIds.includes(id)) continue;
    factsByFr.set(id, row);
  }

  const frPayload = frList.map((unit) => {
    const facts = factsByFr.get(unit.id) || {};
    const row = {
      id: unit.id,
      name: truncate(unit.name || unit.id, UNIT_NAME_MAX),
      description: truncate(unit.description || unit.statement || '', UNIT_DESC_MAX) || undefined,
      ac: unitAcList({ ac: unit.ac }),
      epicId: unit.epicId || undefined,
      storyId: unit.storyId || undefined,
      module: unit.module || undefined,
      feature: unit.feature || undefined,
      capability: facts.capability ? truncate(facts.capability, 200) : undefined,
      intent: facts.intent ? truncate(facts.intent, 200) : undefined,
    };
    for (const key of Object.keys(row)) {
      if (row[key] == null || row[key] === '' || (Array.isArray(row[key]) && !row[key].length)) {
        delete row[key];
      }
    }
    return row;
  });

  const roleHint = roleEnumHintFromAllowList(roleAllowList) || ROLE_ENUM_HINT;
  const lines = [
    localeInstruction || 'Respond in the same language as FR titles.',
    'Decompose each input Story into the minimum sufficient set of developer-actionable tasks.',
    'Return JSON only. No prose.',
    `Shape:{"chunkFrIds":[${chunkFrIds.map((id) => JSON.stringify(id)).join(',')}],"nodes":[{"id","name","level":"task","sourceFrIds","acRefs","deliverable","suggestedRoleKey","area","effortSeedHours?"}]}`,
    'chunkFrIds must equal the FR ids in this call, any order. This call is one chunk; the chunk count changes every run. Return tasks only for these ids.',
    [
      'Rules:',
      '1. Every source FR in this chunk must map to at least one task. One task is sufficient for a small FR.',
      '2. Split only for distinct, independently meaningful implementation deliverables. Do not split automatically by frontend/backend/API/database or create arbitrary tasks per layer.',
      '3. Each task must describe a concrete engineering action, the specific behavior or component, and its expected outcome. Avoid vague titles such as "Implement frontend", "Develop backend", or "Implement feature X".',
      '4. Derive tasks only from the provided Story, FR, acceptance criteria, and context. Do not invent business rules, APIs, schemas, technologies, or implementation details.',
      '5. Minimize task count without omitting required work. Avoid duplicates, redundant subtasks, and unrelated testing/documentation tasks.',
      '6. Preserve source Story, FR, and acceptance-criteria traceability. Follow the exact output JSON schema.',
      `Schema: level is "task" only. sourceFrIds is exactly one id from FR. acRefs ⊆ that FR.ac and non-empty when FR.ac is non-empty. deliverable is required on every node and is the concrete output artifact; name must not copy the FR title. suggestedRoleKey∈${roleHint}. area∈${AREA_ENUM.join('|')}. effortSeedHours is optional. Do not invent FR ids. Do not analyze NFR or Customer-Raw CR-*.`,
    ].join('\n'),
    `FR=${JSON.stringify(frPayload)}`,
    semantic ? `SEMANTIC=${JSON.stringify(semantic)}` : null,
  ].filter(Boolean);
  return lines.join('\n');
}

/**
 * Hang task leaves on the Gate1 anchor of their FR.
 * An FR with 2+ tasks becomes a Feature under that Story, or under the Epic when no Story cites it.
 */
function placeLeavesOnFrAnchors({ epics = [], stories = [], leaves = [], frUnits = null } = {}) {
  const units =
    Array.isArray(frUnits) && frUnits.length
      ? frUnits
      : collectFrUnits(stories, epics, null);
  const byFr = new Map(units.filter((unit) => unit?.id).map((unit) => [unit.id, unit]));
  const groups = new Map();
  for (const leaf of leaves) {
    const frId = normalizeRef(leaf?.sourceFrIds?.[0]);
    const key = frId || `__orphan__${leaf?.id || groups.size}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(leaf);
  }

  const features = [];
  const placed = [];
  for (const [key, group] of groups) {
    const unit = byFr.get(key) || null;
    const storyId = unit?.storyId || null;
    const epicId = unit?.epicId || null;
    const anchor = storyId || epicId || normalizeRef(group[0]?.parentStoryId) || null;
    if (unit && group.length >= 2) {
      features.push({
        id: unit.id,
        name: unit.name || unit.id,
        description: unit.statement || unit.description || '',
        parentId: anchor,
        level: 'feature',
        sourceFrIds: [unit.id],
        sourceUcIds: [],
        sourceNfrIds: [],
        acRefs: Array.isArray(unit.ac) ? [...unit.ac] : [],
        suggestedRoleKey: 'technical_lead',
        effortSeedHours: 0,
        effortHours: 0,
        needsDecomposition: false,
      });
      for (const leaf of group) {
        placed.push({
          ...leaf,
          parentId: unit.id,
          parentFeatureId: unit.id,
          parentStoryId: storyId,
          parentEpicId: epicId,
          level: 'task',
        });
      }
      continue;
    }
    for (const leaf of group) {
      placed.push({
        ...leaf,
        parentId: anchor || leaf.parentId || null,
        parentStoryId: storyId || leaf.parentStoryId || null,
        parentEpicId: epicId || leaf.parentEpicId || null,
        level: 'task',
      });
    }
  }
  return { features, leaves: placed };
}

/**
 * Materialize epic + story from SoT, then Feature when one FR has 2+ tasks.
 */
function materializeWbsFromSotAndLeaves({
  epics = [],
  stories = [],
  leaves = [],
  frUnits = null,
} = {}) {
  const storyList = normalizeStoriesForWbs(stories);
  const epicContainers = (Array.isArray(epics) ? epics : [])
    .map((e) => {
      const id = normalizeRef(e?.id);
      if (!id) return null;
      return {
        id,
        name: e.name || id,
        description: e.description || '',
        parentId: null,
        level: 'epic',
        sourceFrIds: Array.isArray(e.sourceFrIds)
          ? e.sourceFrIds.map(normalizeRef).filter(Boolean)
          : Array.isArray(e.fr)
            ? e.fr.map(normalizeRef).filter(Boolean)
            : [],
        sourceUcIds: [],
        sourceNfrIds: [],
        acRefs: [],
        suggestedRoleKey: 'business_analyst',
        effortSeedHours: 0,
        effortHours: 0,
        needsDecomposition: false,
      };
    })
    .filter(Boolean);

  const epicIds = new Set(epicContainers.map((e) => e.id));
  const storyContainers = storyList.map((s) => {
    const parentRaw = normalizeRef(s.parentId);
    const parentId = parentRaw && epicIds.has(parentRaw) ? parentRaw : null;
    return {
      id: s.id,
      name: s.name || s.id,
      description: s.description || '',
      parentId,
      level: 'story',
      sourceFrIds: [...(s.fr || [])],
      sourceUcIds: [...(s.uc || [])],
      sourceNfrIds: [],
      acRefs: Array.isArray(s.ac) ? [...s.ac] : [],
      suggestedRoleKey: 'business_analyst',
      effortSeedHours: 0,
      effortHours: 0,
      needsDecomposition: true,
    };
  });

  const enrichedLeaves = (Array.isArray(leaves) ? leaves : []).map((leaf) => {
    const area = String(leaf?.area || 'backend').toLowerCase() || 'backend';
    const parentStoryId = normalizeRef(leaf.parentStoryId || '');
    return {
      ...leaf,
      parentStoryId,
      level: 'task',
      area,
      suggestedRoleKey: resolveLeafSuggestedRole(leaf, area),
      deliverable: String(leaf?.deliverable || '').trim(),
    };
  });

  const placed = placeLeavesOnFrAnchors({
    epics,
    stories: storyList,
    leaves: enrichedLeaves,
    frUnits,
  });
  const tasks = [
    ...epicContainers,
    ...storyContainers,
    ...placed.features,
    ...placed.leaves,
  ];
  const roots = tasks.filter((t) => !t.parentId).map((t) => t.id);
  return {
    tasks,
    wbs: {
      roots,
      nodes: tasks,
      taskCount: placed.leaves.length,
      featureCount: placed.features.length,
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
 *   stories?: object[],
 *   epics?: object[],
 *   semantic?: object|null,
 *   roleAllowList?: string[]|null,
 *   env?: object,
 *   generateJsonFn?: Function,
 * }} opts
 */
async function proposeWbsTasksWithLlm(opts = {}) {
  const env = opts.env || process.env;
  const stories = normalizeStoriesForWbs(opts.stories);
  const epics = Array.isArray(opts.epics) ? opts.epics : [];
  const semantic = opts.semantic && typeof opts.semantic === 'object' ? opts.semantic : null;
  const roleAllowList = Array.isArray(opts.roleAllowList) ? opts.roleAllowList : null;

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
        fallbackReason: 'missing_approved_backlog_stories',
        reasonCodes: ['missing_approved_backlog_stories'],
        llmCalls: 0,
      },
    };
  }

  const localeInstruction =
    semantic?.business?.languageInstruction ||
    (() => {
      try {
        const {
          normalizeDeriveLocale,
          languageInstruction: langFn,
        } = require('../semantic/buildSemanticDeriveContext');
        const locale = normalizeDeriveLocale(
          semantic?.business?.locale || env.PHASE1_DERIVE_LOCALE
        );
        return langFn(locale);
      } catch {
        return '';
      }
    })();

  const frUnits = collectFrUnits(stories, epics, semantic);
  if (!frUnits.length) {
    return {
      ok: false,
      meta: {
        source: 'llm_failed',
        decompositionOutcome: 'failure',
        fallbackReason: 'missing_approved_fr',
        reasonCodes: ['missing_approved_fr'],
        llmCalls: 0,
        storyCount: stories.length,
        epicCount: epics.length,
      },
    };
  }

  const chunks = planWbsCallSlices(frUnits, env);

  const gen = typeof opts.generateJsonFn === 'function' ? opts.generateJsonFn : generateJson;
  const { isWbsChunkOrchestratorEnabled } = require('../wbsChunk/wbsChunkContract');
  if (isWbsChunkOrchestratorEnabled(env)) {
    const { runWbsChunkOrchestrator } = require('../wbsChunk/runWbsChunkOrchestrator');
    return runWbsChunkOrchestrator({
      stories,
      epics,
      semantic,
      roleAllowList,
      localeInstruction,
      frUnits,
      env,
      generateJsonFn: gen,
      runId: opts.runId || null,
      generationId: opts.generationId || opts.runId || null,
      inputSnapshotId: opts.inputSnapshotId || null,
    });
  }

  const numCtx = resolveWbsLlmNumCtx(env);
  const timeoutMs = resolveWbsLlmTimeoutMs(env);
  const t0 = Date.now();
  const allLeaves = [];
  const isolatedFrIds = [];
  let llmCalls = 0;
  let lastModel = null;
  let promptChars = 0;

  function coveredFrIds(leaves) {
    const ids = new Set();
    for (const leaf of leaves || []) {
      const frId = normalizeRef(leaf?.sourceFrIds?.[0]);
      if (frId) ids.add(frId);
    }
    return ids;
  }

  async function runFrSlice(slice, idPrefix) {
    const prompt = buildWbsStoryLlmPrompt({
      frUnits: slice,
      semantic,
      localeInstruction,
      roleAllowList,
    });
    promptChars += prompt.length;
    const numPredict = resolveWbsLlmNumPredict(slice.length, env);
    let llmResult;
    try {
      llmResult = await cachedGenerateJson({
        prompt,
        numPredict,
        numCtx,
        timeoutMs,
        temperature: 0.1,
        env,
        jobType: 'wbs',
        generateJsonFn: gen,
      });
    } catch (err) {
      llmCalls += 1;
      return { ok: false, reason: String(err?.message || err || 'llm_throw') };
    }
    if (!llmResult?.cacheHit) llmCalls += 1;
    lastModel = llmResult?.model || lastModel;
    if (!llmResult?.ok || llmResult.data == null) {
      return { ok: false, reason: llmResult?.error || 'llm_failed' };
    }
    const accepted = acceptWbsStoryTasks(llmResult.data, stories, {
      frUnits: slice,
      epics,
      semantic,
      roleAllowList,
      requireChunkEnvelope: true,
    });
    if (!accepted.ok) {
      return { ok: false, reason: (accepted.errors || ['contract_fail']).join(';') };
    }
    return {
      ok: true,
      tasks: accepted.tasks.map((leaf) => ({ ...leaf, id: `${idPrefix}-${leaf.id}` })),
    };
  }

  async function fillUncovered(slice, idPrefix, leaves) {
    const covered = coveredFrIds(leaves);
    const missing = (slice || []).filter((unit) => unit?.id && !covered.has(unit.id));
    if (!missing.length) return;
    const one = await runFrSlice(missing, `${idPrefix}f`);
    if (one.ok) leaves.push(...one.tasks);
    const now = coveredFrIds(leaves);
    for (const unit of missing) {
      if (now.has(unit.id)) continue;
      console.error('[how-propose-wbs] slice_fail', unit.id, one.reason || 'uncovered');
      isolatedFrIds.push(unit.id);
    }
  }

  for (let ci = 0; ci < chunks.length; ci += 1) {
    const chunkFr = chunks[ci];
    const first = await runFrSlice(chunkFr, `c${ci}`);
    const bucket = [];
    if (first.ok) {
      bucket.push(...first.tasks);
    } else {
      console.error('[how-propose-wbs] contract_fail', `chunk=${ci}`, first.reason);
    }
    if (chunkFr.length < 2 && !first.ok) {
      await fillUncovered(chunkFr, `c${ci}`, bucket);
    } else if (coveredFrIds(bucket).size < chunkFr.length) {
      await fillUncovered(chunkFr, `c${ci}`, bucket);
    }
    allLeaves.push(...bucket);
  }

  if (!allLeaves.length) {
    return {
      ok: false,
      meta: {
        source: 'llm_invalid',
        decompositionOutcome: 'failure',
        fallbackReason: 'all_fr_slices_failed',
        reasonCodes: isolatedFrIds.length ? isolatedFrIds : ['all_fr_slices_failed'],
        isolatedFrIds,
        llmCalls,
        llmMs: Date.now() - t0,
        model: lastModel,
        promptChars,
      },
    };
  }

  const deduped = dedupeWbsLeaves(allLeaves);
  const leaves = deduped.leaves;

  const coveredFr = new Set();
  for (const leaf of leaves) {
    const frId = normalizeRef(leaf?.sourceFrIds?.[0]);
    if (frId) coveredFr.add(frId);
  }
  const uncoveredFrIds = frUnits
    .filter((unit) => !coveredFr.has(unit.id))
    .map((unit) => unit.id);
  const uncoveredAcKeys = [];
  const leavesByFr = new Map();
  for (const leaf of leaves) {
    const frId = normalizeRef(leaf?.sourceFrIds?.[0]);
    if (!frId) continue;
    if (!leavesByFr.has(frId)) leavesByFr.set(frId, []);
    leavesByFr.get(frId).push(leaf);
  }
  for (const unit of frUnits) {
    const group = leavesByFr.get(unit.id);
    if (!group?.length) continue;
    const cited = [];
    for (const leaf of group) {
      for (const ac of leaf.acRefs || []) cited.push(ac);
    }
    for (const ac of unit.ac || []) {
      if (!acCitationCoversWhitelist(ac, cited)) uncoveredAcKeys.push(`${unit.id}:${ac}`);
    }
  }
  const unresolvedStoryIds = stories
    .filter((story) => {
      const frs = story.fr || [];
      return frs.length > 0 && frs.every((id) => !coveredFr.has(id));
    })
    .map((story) => story.id);
  const decompositionOutcome = resolveDecompositionOutcome({
    leafCount: leaves.length,
    unresolvedUnitIds: unresolvedStoryIds,
    uncoveredFrIds,
    uncoveredAcKeys,
  });

  console.info(
    `[how-propose-wbs] outcome=${decompositionOutcome} leaves=${leaves.length} unique=${deduped.uniqueLeafCount} dup=${deduped.duplicateLeafIds.length} unresolvedStories=${unresolvedStoryIds.length} uncoveredFr=${uncoveredFrIds.length} uncoveredAc=${uncoveredAcKeys.length}`
  );

  const materialized = materializeWbsFromSotAndLeaves({
    epics,
    stories,
    leaves,
    frUnits,
  });
  return {
    ok: true,
    tasks: materialized.tasks,
    wbs: materialized.wbs,
    meta: {
      source: chunks.length > 1 ? 'llm_fr_tasks_chunked' : 'llm_fr_tasks',
      decompositionOutcome,
      unresolvedUnitIds: unresolvedStoryIds,
      unresolvedStoryIds,
      storyCount: stories.length,
      epicCount: epics.length,
      featureCount: materialized.wbs?.featureCount || 0,
      uncoveredFrIds,
      isolatedFrIds,
      uncoveredAcKeys,
      duplicateLeafIds: deduped.duplicateLeafIds,
      uniqueLeafCount: deduped.uniqueLeafCount,
      llmCalls,
      llmMs: Date.now() - t0,
      model: lastModel,
      promptChars,
      unitCount: frUnits.length,
      leafCount: leaves.length,
      chunks: chunks.length,
    },
  };
}

function isHowWbsLlmEnabled(env = process.env) {
  return isHowWbsLlmFlagOn(env) && isLlmEnabled(env);
}

module.exports = {
  proposeWbsTasksWithLlm,
  acceptWbsStoryTasks,
  collectFrUnits,
  placeLeavesOnFrAnchors,
  assertStoryTaskCoverage,
  reportUnitTaskPresence,
  reportStoryTaskPresence,
  assertFrAcCoverage,
  resolveDecompositionOutcome,
  buildWbsStoryLlmPrompt,
  materializeWbsFromSotAndLeaves,
  resolveLeafSuggestedRole,
  resolveLeafDeliverable,
  dedupeWbsLeaves,
  isHowWbsLlmEnabled,
  normalizeStoriesForWbs,
  acRefAllowed,
  normalizeAcKey,
  acCitationCoversWhitelist,
};
