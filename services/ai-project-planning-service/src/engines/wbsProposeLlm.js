/**
 * WBS LLM propose — task leaves under Gate1-approved Stories (SoT) + semantic.
 * Input: stories (+ epics for materialize) + semantic. No FR-unit invent / RAG CTX.
 */

const { generateJson, isLlmEnabled } = require('../runtime/ollamaGenerate');
const { cachedGenerateJson } = require('../artifacts/cachedGenerateJson');
const {
  isHowWbsLlmFlagOn,
  resolveWbsLlmNumPredict,
  resolveWbsLlmNumCtx,
  resolveWbsLlmTimeoutMs,
  resolveWbsLlmMaxRepair,
  planWbsCallSlices,
} = require('../contracts/howWbsLlmContract');
const {
  roleKeyForArea,
  resolveTaskDisplayName,
  applyContainerEffortRollup,
  dedupeChildTitlesAgainstParents,
} = require('./wbsAgileNaming');
const {
  isKnownProjectRole,
  resolveAllowedProjectRoleKey,
  canonicalizeProjectRoleKey,
  roleEnumHintFromAllowList,
} = require('./roleKey');
const {
  assessInputReadiness,
  assessDecompositionQuality,
  formatRepairFeedback,
} = require('./wbsDecompositionQuality');

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

/** Drop temporary fr-from-cr chunk prefix from epic titles (`c0-EPIC-IOT` → `EPIC-IOT`). */
function cleanEpicTitle(name, id) {
  const raw = String(name || '').trim();
  const cleanId = String(id || '').replace(/^c\d+-/i, '') || id;
  if (!raw || raw === id || raw === cleanId) return cleanId;
  if (/^c\d+-/i.test(raw)) return raw.replace(/^c\d+-/i, '') || raw;
  return raw;
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

/** Normalize AC lines from FR/story/meta shapes (array, list, or newline/; string). */
function extractAcLines(row, max = UNIT_AC_MAX) {
  if (!row || typeof row !== 'object') {
    if (typeof row === 'string' && row.trim()) {
      return row
        .split(/\n|;/)
        .map((s) => truncate(s.replace(/^[-*•\d.)\s]+/, '').trim(), UNIT_AC_CHARS))
        .filter((s) => s.length >= 3)
        .slice(0, max);
    }
    return [];
  }
  if (Array.isArray(row.ac) || Array.isArray(row.acRefs) || Array.isArray(row.acs)) {
    const raw = row.ac || row.acRefs || row.acs;
    return raw
      .map((item) => {
        if (typeof item === 'string') return truncate(item.trim(), UNIT_AC_CHARS);
        return truncate(
          String(item?.text || item?.statement || item?.description || '').trim(),
          UNIT_AC_CHARS
        );
      })
      .filter((s) => s.length >= 3)
      .slice(0, max);
  }
  if (Array.isArray(row.acceptanceCriteriaList)) {
    return row.acceptanceCriteriaList
      .map((item) => {
        if (typeof item === 'string') return truncate(item.trim(), UNIT_AC_CHARS);
        return truncate(String(item?.text || '').trim(), UNIT_AC_CHARS);
      })
      .filter((s) => s.length >= 3)
      .slice(0, max);
  }
  const raw = row.acceptanceCriteria || '';
  if (typeof raw !== 'string' || !raw.trim()) return [];
  return raw
    .split(/\n|;/)
    .map((s) => truncate(s.replace(/^[-*•\d.)\s]+/, '').trim(), UNIT_AC_CHARS))
    .filter((s) => s.length >= 3)
    .slice(0, max);
}

/**
 * Parse LLM index-style AC cites (FR-1:ac:1, ac:FR-1:1, ac:1, AC-1).
 * @returns {number|null} 1-based index
 */
function parseAcIndexCitation(raw, frId = null) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const frOk = frId ? normalizeRef(frId) : null;

  let m = s.match(/^([A-Za-z][\w.-]*):ac:(\d+)$/i);
  if (m) {
    if (frOk && normalizeRef(m[1]) !== frOk) return null;
    const n = Number(m[2]);
    return Number.isFinite(n) && n >= 1 ? n : null;
  }

  m = s.match(/^ac:([A-Za-z][\w.-]*):(\d+)$/i);
  if (m) {
    if (frOk && normalizeRef(m[1]) !== frOk) return null;
    const n = Number(m[2]);
    return Number.isFinite(n) && n >= 1 ? n : null;
  }

  m = s.match(/^ac:(\d+)$/i);
  if (m) {
    const n = Number(m[1]);
    return Number.isFinite(n) && n >= 1 ? n : null;
  }

  m = s.match(/^ac[-_]?(\d+)$/i);
  if (m) {
    const n = Number(m[1]);
    return Number.isFinite(n) && n >= 1 ? n : null;
  }

  return null;
}

function acRefTokens(raw) {
  return normalizeAcKey(raw)
    .split(/[\s/|,;·•\-–—]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

/** True when most tokens of received appear in whitelist item (LLM paraphrase). */
function acRefTokenOverlap(received, whitelistItem) {
  const rTok = acRefTokens(received);
  if (rTok.length < 2) return false;
  const wSet = new Set(acRefTokens(whitelistItem));
  if (!wSet.size) return false;
  const hit = rTok.filter((t) => wSet.has(t)).length;
  return hit >= 2 && hit / rTok.length >= 0.75;
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
    // qwen3.8-flash often shortens AC ("KPI theo 7 ngày" vs full whitelist line)
    if (acRefTokenOverlap(r, n)) return true;
  }
  return false;
}

/**
 * Map a received acRef to a canonical whitelist AC string (text or index cite).
 * @returns {string|null}
 */
function resolveAcRefToWhitelist(received, whitelist, opts = {}) {
  const list = whitelist instanceof Set ? [...whitelist] : Array.isArray(whitelist) ? whitelist : [];
  if (!list.length) return null;
  const raw = normalizeRef(received);
  if (!raw) return null;

  for (const w of list) {
    if (normalizeRef(w) === raw) return w;
  }
  for (const w of list) {
    if (acRefAllowed(raw, [w])) return w;
  }

  const idx = parseAcIndexCitation(raw, opts.frId || null);
  if (idx != null && idx >= 1 && idx <= list.length) {
    return list[idx - 1];
  }
  return null;
}

function acCitationCoversWhitelist(whitelistAc, citedRawList, opts = {}) {
  const cited = Array.isArray(citedRawList) ? citedRawList : [];
  if (cited.some((c) => normalizeRef(c) === whitelistAc)) return true;
  if (cited.some((c) => acRefAllowed(c, [whitelistAc]))) return true;
  const list = Array.isArray(opts.acList) && opts.acList.length ? opts.acList : [whitelistAc];
  return cited.some((c) => {
    const resolved = resolveAcRefToWhitelist(c, list, opts);
    return resolved != null && normalizeRef(resolved) === normalizeRef(whitelistAc);
  });
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

function indexFrRowsIntoMeta(frMeta, rows = []) {
  for (const row of rows || []) {
    const id = normalizeRef(row?.id || row?.externalId || row?._id);
    if (!id || isCustomerRequirementId(id)) continue;
    if (!frMeta.has(id)) frMeta.set(id, row);
  }
}

/**
 * FR work units for WBS. Story that cites the FR wins; otherwise the Epic that lists it.
 * AC prefers per-FR meta (semantic.approved.fr / pack FR); single-FR story.ac is fallback.
 * @param {object[]} stories
 * @param {object[]} epics
 * @param {object|null} semantic
 * @param {object|null} pack
 */
function collectFrUnits(stories = [], epics = [], semantic = null, pack = null) {
  const storyList = normalizeStoriesForWbs(stories);
  const frMeta = new Map();
  const approved = Array.isArray(semantic?.approved?.fr) ? semantic.approved.fr : [];
  indexFrRowsIntoMeta(frMeta, approved);
  const layerFrs = semantic?.layer?.requiredData?.functionalRequirements;
  if (Array.isArray(layerFrs)) indexFrRowsIntoMeta(frMeta, layerFrs);
  if (pack && typeof pack === 'object') {
    const packFrs = Array.isArray(pack.functionalRequirements)
      ? pack.functionalRequirements
      : Array.isArray(pack.frList)
        ? pack.frList
        : Array.isArray(pack.requirements)
          ? pack.requirements
          : [];
    indexFrRowsIntoMeta(frMeta, packFrs);
  }

  /** @type {Map<string, object>} */
  const byId = new Map();
  const order = [];

  function resolveUnitAc(meta, anchorAc) {
    const fromMeta = extractAcLines(meta);
    if (fromMeta.length) return fromMeta;
    const fromAnchor = Array.isArray(anchorAc)
      ? anchorAc.map((a) => truncate(String(a || '').trim(), UNIT_AC_CHARS)).filter((s) => s.length >= 3)
      : [];
    return fromAnchor.slice(0, UNIT_AC_MAX);
  }

  function touch(frId, anchor) {
    const id = normalizeRef(frId);
    if (!id || isCustomerRequirementId(id)) return;
    const meta = frMeta.get(id) || {};
    const prev = byId.get(id);
    if (prev) {
      if (!prev.storyId && anchor.storyId) {
        prev.storyId = anchor.storyId;
        prev.epicId = anchor.epicId || prev.epicId;
        prev.parentId = anchor.storyId;
        if (!prev.ac?.length) prev.ac = resolveUnitAc(meta, anchor.ac);
        else if (anchor.ac?.length && !extractAcLines(meta).length) prev.ac = resolveUnitAc({}, anchor.ac);
        if (anchor.description) prev.description = anchor.description;
        if (anchor.module) prev.module = anchor.module;
        if (anchor.feature) prev.feature = anchor.feature;
      }
      return;
    }
    const name =
      truncate(meta.statement || meta.name || meta.title || anchor.name || id, UNIT_NAME_MAX) || id;
    byId.set(id, {
      id,
      name,
      description: anchor.description || '',
      statement: meta.statement || meta.text || anchor.description || '',
      ac: resolveUnitAc(meta, anchor.ac),
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
        // Multi-FR: do not broadcast story.ac onto every FR; per-FR meta supplies AC (D).
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
      : collectFrUnits(stories, opts.epics || [], opts.semantic || null, opts.pack || null);
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
    const acList = (Array.isArray(frUnit.ac) ? frUnit.ac : [])
      .map((x) => normalizeRef(x))
      .filter(Boolean);
    const acOk = new Set(acList);
    const parentStoryId = frUnit.storyId || null;

    const rawAcRefs = Array.isArray(row.acRefs)
      ? row.acRefs
      : Array.isArray(row.sourceAcIds)
        ? row.sourceAcIds
        : [];
    const acRefs = [];
    for (const item of rawAcRefs) {
      const ac = normalizeRef(item);
      if (!ac) continue;
      const canon = resolveAcRefToWhitelist(ac, acList, { frId });
      if (!canon) {
        return {
          ok: false,
          errors: [
            `invalid_acRef_${id}`,
            `received=${ac}`,
            `whitelist=${acList.slice(0, 12).join('|')}`,
          ],
        };
      }
      if (!acRefs.includes(canon)) acRefs.push(canon);
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
      return { ok: false, errors: [`missing_deliverable_${id}`] };
    }

    const rawSeed = row.effortSeedHours ?? row.effortHours;
    let effortSeedHours;
    if (rawSeed !== undefined && rawSeed !== null && String(rawSeed).trim() !== '') {
      const effort = Number(rawSeed);
      if (!Number.isFinite(effort) || effort <= 0) {
        return { ok: false, errors: [`invalid_effort_${id}`] };
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

  const clarifications = normalizeClarifications(raw.clarifications);
  return { ok: true, tasks, clarifications };
}

function normalizeClarifications(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((row) => row && typeof row === 'object')
    .map((row) => ({
      frId: normalizeRef(row.frId || row.fr || ''),
      code: String(row.code || 'needs_clarification').trim() || 'needs_clarification',
      question: truncate(row.question || row.message || '', 500),
      missing: Array.isArray(row.missing)
        ? row.missing.map((x) => String(x).trim()).filter(Boolean).slice(0, 8)
        : [],
    }))
    .filter((row) => row.question);
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
    const unitAcList = [...unitAcWhitelist(unit)];
    for (const ac of unitAcList) {
      if (!acCitationCoversWhitelist(ac, citedAcList, { acList: unitAcList, frId: uid })) {
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
  qualityIssues = [],
  clarifications = [],
  needsReview = false,
}) {
  if (needsReview || (Array.isArray(clarifications) && clarifications.length > 0)) {
    return 'needs_review';
  }
  if (Array.isArray(qualityIssues) && qualityIssues.length > 0) {
    return 'needs_review';
  }
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
 * Production prompt — decompose FR into independently completable tasks with separate outputs.
 * Feature nodes are not requested; ≥2 tasks on one FR are promoted later.
 */
function buildWbsStoryLlmPrompt({
  stories = [],
  units = [],
  frUnits = null,
  epics = [],
  semantic = null,
  localeInstruction = '',
  roleAllowList = null,
  repairFeedback = null,
} = {}) {
  const list = normalizeStoriesForWbs(
    Array.isArray(stories) && stories.length ? stories : units
  );
  const frList =
    Array.isArray(frUnits) && frUnits.length
      ? frUnits
      : collectFrUnits(list, epics, semantic, null);
  const chunkFrIds = frList.map((unit) => unit.id).filter(Boolean);
  const factsByFr = new Map();
  for (const row of Array.isArray(semantic?.approved?.fr) ? semantic.approved.fr : []) {
    const id = normalizeRef(row?.id);
    if (!id || !chunkFrIds.includes(id)) continue;
    factsByFr.set(id, row);
  }

  const frPayload = frList.map((unit) => {
    const facts = factsByFr.get(unit.id) || {};
    const businessRules = [];
    if (Array.isArray(unit.businessRules)) {
      for (const rule of unit.businessRules) {
        const text = truncate(rule, 240);
        if (text) businessRules.push(text);
      }
    }
    if (facts.businessRule) businessRules.push(truncate(facts.businessRule, 240));
    if (Array.isArray(facts.rules)) {
      for (const rule of facts.rules) {
        const text = truncate(rule?.text || rule, 240);
        if (text) businessRules.push(text);
      }
    }
    const row = {
      id: unit.id,
      name: truncate(unit.name || unit.id, UNIT_NAME_MAX),
      description: truncate(unit.description || unit.statement || '', UNIT_DESC_MAX) || undefined,
      ac: unitAcList({ ac: unit.ac }),
      businessRules: businessRules.length ? businessRules.slice(0, 8) : undefined,
      relatedData: facts.relatedData
        ? truncate(
            typeof facts.relatedData === 'string'
              ? facts.relatedData
              : JSON.stringify(facts.relatedData),
            400
          )
        : undefined,
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
    'Decompose each Story/FR into concrete, assignable work items with separate completable outputs.',
    'Return JSON only. No prose.',
    `Shape:{"chunkFrIds":[${chunkFrIds.map((id) => JSON.stringify(id)).join(',')}],"nodes":[{"id","name","level":"task","sourceFrIds","acRefs","deliverable","suggestedRoleKey","area","effortSeedHours?"}],"clarifications":[{"frId","code","question","missing"}]?}`,
    'chunkFrIds must equal the FR ids in this call, any order. Return tasks only for these ids.',
    [
      'Rules:',
      '1. Decompose into specific implementation work that can be assigned and verified independently. Having at least one task per FR is necessary but not sufficient.',
      '2. Each task must state the action, the object being handled, and the completion output (deliverable). Do not use one task to restate the entire Story.',
      '3. Consider UI, business processing, persistence, integration, and testing when the source (Story/FR/AC/businessRules) provides a basis. Do not invent a full set of groups when the source does not require them.',
      '4. Every task must link sourceFrIds + acRefs to the source FR/AC. Do not add behaviors absent from those sources (including map display, notifications, exports).',
      '5. Client-side / UI validation does not replace server-side validity or uniqueness checks when the source requires storing or uniquely identifying data.',
      '6. If information is insufficient to decompose safely, return clarifications with what must be clarified and omit invented rules/tasks for that FR.',
      '7. acRefs must be exact strings from that FR.ac (or sourceAcIds with the same texts). Cite only AC lines the task actually implements. Every AC in the FR should be covered by at least one task.',
      `Schema: level is "task" only. sourceFrIds is exactly one id from FR. acRefs ⊆ FR.ac and non-empty when FR.ac is non-empty. deliverable is required. name must not copy the FR/Story title. suggestedRoleKey∈${roleHint}. area∈${AREA_ENUM.join('|')}. effortSeedHours optional. Do not invent FR ids. Do not analyze NFR or Customer-Raw CR-*.`,
    ].join('\n'),
    `FR=${JSON.stringify(frPayload)}`,
    semantic ? `SEMANTIC=${JSON.stringify(semantic)}` : null,
    repairFeedback
      ? `REPAIR=${JSON.stringify(repairFeedback)}`
      : null,
  ].filter(Boolean);
  return lines.join('\n');
}

/**
 * MVP: hang task leaves directly under Gate1 Story (Epic → Story → Task).
 * No Feature=FR invent; no Work Package invent; no Story=FR invent.
 */
function placeLeavesOnFrAnchors({ epics = [], stories = [], leaves = [], frUnits = null } = {}) {
  const units =
    Array.isArray(frUnits) && frUnits.length
      ? frUnits
      : collectFrUnits(stories, epics, null);
  const byFr = new Map(units.filter((unit) => unit?.id).map((unit) => [unit.id, unit]));
  const storyById = new Map(
    (Array.isArray(stories) ? stories : [])
      .map((s) => [normalizeRef(s?.id), s])
      .filter(([id]) => id)
  );

  const placed = [];
  const indexByStory = new Map();
  for (const leaf of leaves) {
    const frId = normalizeRef(leaf?.sourceFrIds?.[0]);
    const unit = frId ? byFr.get(frId) : null;
    const storyId =
      normalizeRef(leaf?.parentStoryId) ||
      unit?.storyId ||
      normalizeRef(leaf?.parentId) ||
      null;
    const epicId = unit?.epicId || normalizeRef(leaf?.parentEpicId) || null;
    const area = String(leaf?.area || 'backend').toLowerCase() || 'backend';
    const story = storyId ? storyById.get(storyId) : null;
    const idx = indexByStory.get(storyId || '__orphan__') || 0;
    indexByStory.set(storyId || '__orphan__', idx + 1);
    const taskName = resolveTaskDisplayName({
      leafName: leaf.name,
      storyName: story?.name || storyId || '',
      area,
      index: idx,
    });
    placed.push({
      ...leaf,
      name: taskName,
      parentId: storyId || null,
      parentStoryId: storyId || leaf.parentStoryId || null,
      parentEpicId: epicId || leaf.parentEpicId || null,
      level: 'task',
      area,
    });
  }
  return { features: [], workPackages: [], leaves: placed };
}

/** Stamp depth from parentId chain. LLM must not invent depth. */
function stampWbsDepth(nodes = []) {
  const list = Array.isArray(nodes) ? nodes.map((n) => ({ ...n })) : [];
  const byId = new Map(list.map((n) => [String(n.id), n]));
  const memo = new Map();
  function depthOf(id, stack = new Set()) {
    const key = String(id || '');
    if (!key || !byId.has(key)) return 0;
    if (memo.has(key)) return memo.get(key);
    if (stack.has(key)) return 0;
    stack.add(key);
    const node = byId.get(key);
    const parentId = node.parentId != null && node.parentId !== '' ? String(node.parentId) : null;
    const d = parentId && byId.has(parentId) ? depthOf(parentId, stack) + 1 : 0;
    memo.set(key, d);
    node.depth = d;
    return d;
  }
  for (const n of list) depthOf(n.id);
  return list;
}

/**
 * Materialize MVP tree from Gate1 SoT + LLM task leaves:
 * Epic → Story → Task (Story may be root when parentEpicId null).
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
      const rawId = normalizeRef(e?.id);
      if (!rawId) return null;
      const id = rawId.replace(/^c\d+-/i, '') || rawId;
      return {
        id,
        name: cleanEpicTitle(e.name || e.title, rawId),
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
    const parentClean = parentRaw ? parentRaw.replace(/^c\d+-/i, '') || parentRaw : '';
    const parentId =
      parentClean && epicIds.has(parentClean)
        ? parentClean
        : parentRaw && epicIds.has(parentRaw)
          ? parentRaw
          : null;
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
  const rawTasks = [...epicContainers, ...storyContainers, ...placed.leaves];
  const tasks = stampWbsDepth(
    applyContainerEffortRollup(dedupeChildTitlesAgainstParents(rawTasks))
  );
  const roots = tasks.filter((t) => !t.parentId).map((t) => t.id);
  const epicsWithoutStories = epicContainers
    .filter((e) => !storyContainers.some((s) => s.parentId === e.id))
    .map((e) => e.id);
  return {
    tasks,
    wbs: {
      roots,
      nodes: tasks,
      taskCount: placed.leaves.length,
      featureCount: 0,
      workPackageCount: 0,
      epicsWithoutStories,
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
 *   pack?: object|null,
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
  const pack = opts.pack && typeof opts.pack === 'object' ? opts.pack : null;
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

  const frUnits = collectFrUnits(stories, epics, semantic, pack);
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
  const maxRepair = resolveWbsLlmMaxRepair(env);
  const t0 = Date.now();
  const allLeaves = [];
  const isolatedFrIds = [];
  const allClarifications = [];
  const allQualityIssues = [];
  let needsReview = false;
  let llmCalls = 0;
  let lastModel = null;
  let promptChars = 0;
  let repairAttempts = 0;

  const readiness = assessInputReadiness(frUnits);
  if (!readiness.ok) {
    allClarifications.push(...readiness.clarifications);
    needsReview = true;
  }
  const readyFrIds = new Set(
    frUnits
      .filter((unit) =>
        !readiness.clarifications.some((c) => normalizeRef(c.frId) === normalizeRef(unit.id))
      )
      .map((unit) => unit.id)
  );
  const readyChunks = chunks
    .map((chunk) => chunk.filter((unit) => readyFrIds.has(unit.id)))
    .filter((chunk) => chunk.length > 0);

  function coveredFrIds(leaves) {
    const ids = new Set();
    for (const leaf of leaves || []) {
      const frId = normalizeRef(leaf?.sourceFrIds?.[0]);
      if (frId) ids.add(frId);
    }
    return ids;
  }

  function qualityForSlice(slice, tasks, clarifications) {
    return assessDecompositionQuality({
      frUnits: slice,
      tasks,
      clarifications,
      resolveAcRef: (raw, acList, frId) =>
        resolveAcRefToWhitelist(raw, acList, { frId }),
    });
  }

  async function runFrSliceOnce(slice, idPrefix, repairFeedback) {
    const prompt = buildWbsStoryLlmPrompt({
      frUnits: slice,
      semantic,
      localeInstruction,
      roleAllowList,
      repairFeedback,
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
      return {
        ok: false,
        reason: (accepted.errors || ['contract_fail']).join(';'),
        contractErrors: accepted.errors || [],
      };
    }
    const tasks = accepted.tasks.map((leaf) => ({ ...leaf, id: `${idPrefix}-${leaf.id}` }));
    const quality = qualityForSlice(slice, tasks, accepted.clarifications || []);
    if (accepted.clarifications?.length && (!tasks.length || !quality.ok)) {
      return {
        ok: false,
        needsReview: true,
        clarifications: accepted.clarifications,
        issues: quality.issues,
        tasks,
        reason: 'clarifications_returned',
      };
    }
    if (!quality.ok) {
      return {
        ok: false,
        reason: quality.issues.map((i) => i.code).join('|') || 'quality_fail',
        issues: quality.issues,
        clarifications: quality.clarifications,
        tasks,
        repairFeedback: formatRepairFeedback(quality),
      };
    }
    return { ok: true, tasks, clarifications: accepted.clarifications || [] };
  }

  async function runFrSlice(slice, idPrefix) {
    let feedback = null;
    let last = null;
    for (let attempt = 0; attempt <= maxRepair; attempt += 1) {
      if (attempt > 0) repairAttempts += 1;
      last = await runFrSliceOnce(slice, `${idPrefix}${attempt > 0 ? `r${attempt}` : ''}`, feedback);
      if (last.ok) return last;
      if (last.needsReview) return last;
      if (attempt >= maxRepair) break;
      feedback = last.repairFeedback || {
        instruction: 'Fix contract/quality errors.',
        issues: last.contractErrors || [{ code: 'contract_fail', message: last.reason }],
        clarifications: last.clarifications || [],
      };
    }
    return {
      ok: false,
      needsReview: true,
      reason: last?.reason || 'quality_repair_exhausted',
      issues: last?.issues || [],
      clarifications: last?.clarifications || [],
      tasks: last?.tasks || [],
    };
  }

  async function fillUncovered(slice, idPrefix, leaves) {
    const covered = coveredFrIds(leaves);
    const missing = (slice || []).filter((unit) => unit?.id && !covered.has(unit.id));
    if (!missing.length) return;
    const one = await runFrSlice(missing, `${idPrefix}f`);
    if (one.ok) {
      leaves.push(...one.tasks);
      if (one.clarifications?.length) allClarifications.push(...one.clarifications);
    } else {
      if (one.tasks?.length) leaves.push(...one.tasks);
      if (one.issues?.length) allQualityIssues.push(...one.issues);
      if (one.clarifications?.length) allClarifications.push(...one.clarifications);
      if (one.needsReview) needsReview = true;
    }
    const now = coveredFrIds(leaves);
    for (const unit of missing) {
      if (now.has(unit.id)) continue;
      console.error('[how-propose-wbs] slice_fail', unit.id, one.reason || 'uncovered');
      isolatedFrIds.push(unit.id);
      needsReview = true;
    }
  }

  for (let ci = 0; ci < readyChunks.length; ci += 1) {
    const chunkFr = readyChunks[ci];
    const first = await runFrSlice(chunkFr, `c${ci}`);
    const bucket = [];
    if (first.ok) {
      bucket.push(...first.tasks);
      if (first.clarifications?.length) allClarifications.push(...first.clarifications);
    } else {
      console.error('[how-propose-wbs] quality_or_contract_fail', `chunk=${ci}`, first.reason);
      if (first.tasks?.length) bucket.push(...first.tasks);
      if (first.issues?.length) allQualityIssues.push(...first.issues);
      if (first.clarifications?.length) allClarifications.push(...first.clarifications);
      if (first.needsReview) needsReview = true;
    }
    if (chunkFr.length < 2 && !first.ok) {
      await fillUncovered(chunkFr, `c${ci}`, bucket);
    } else if (coveredFrIds(bucket).size < chunkFr.length) {
      await fillUncovered(chunkFr, `c${ci}`, bucket);
    }
    allLeaves.push(...bucket);
  }

  if (!allLeaves.length && !allClarifications.length) {
    return {
      ok: false,
      meta: {
        source: 'llm_invalid',
        decompositionOutcome: 'failure',
        fallbackReason: 'all_fr_slices_failed',
        reasonCodes: isolatedFrIds.length ? isolatedFrIds : ['all_fr_slices_failed'],
        isolatedFrIds,
        qualityIssues: allQualityIssues,
        clarifications: allClarifications,
        needsReview: true,
        repairAttempts,
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
    if (!readyFrIds.has(unit.id)) continue;
    const group = leavesByFr.get(unit.id);
    if (!group?.length) continue;
    const cited = [];
    for (const leaf of group) {
      for (const ac of leaf.acRefs || []) cited.push(ac);
    }
    const acList = Array.isArray(unit.ac) ? unit.ac : [];
    for (const ac of acList) {
      if (!acCitationCoversWhitelist(ac, cited, { acList, frId: unit.id })) {
        uncoveredAcKeys.push(`${unit.id}:${ac}`);
      }
    }
  }
  const finalQuality = assessDecompositionQuality({
    frUnits: frUnits.filter((unit) => readyFrIds.has(unit.id) && coveredFr.has(unit.id)),
    tasks: leaves,
    clarifications: allClarifications,
    resolveAcRef: (raw, acList, frId) => resolveAcRefToWhitelist(raw, acList, { frId }),
  });
  if (!finalQuality.ok) {
    allQualityIssues.push(...finalQuality.issues);
    needsReview = true;
  }
  if (uncoveredFrIds.length || uncoveredAcKeys.length || allClarifications.length) {
    needsReview = true;
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
    qualityIssues: allQualityIssues,
    clarifications: allClarifications,
    needsReview,
  });

  console.info(
    `[how-propose-wbs] outcome=${decompositionOutcome} leaves=${leaves.length} unique=${deduped.uniqueLeafCount} dup=${deduped.duplicateLeafIds.length} unresolvedStories=${unresolvedStoryIds.length} uncoveredFr=${uncoveredFrIds.length} uncoveredAc=${uncoveredAcKeys.length} qualityIssues=${allQualityIssues.length} repair=${repairAttempts}`
  );

  const materialized = materializeWbsFromSotAndLeaves({
    epics,
    stories,
    leaves,
    frUnits,
  });
  const { stampWbsCoverageMeta } = require('../validation/wbsCoverageGate');
  const coverageMeta = stampWbsCoverageMeta({
    uncoveredFrIds,
    uncoveredAcKeys,
    unresolvedStoryIds,
    unresolvedUnitIds: unresolvedStoryIds,
    leafCount: leaves.length,
    taskCount: leaves.length,
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
      featureCount: 0,
      workPackageCount: 0,
      epicsWithoutStories: materialized.wbs?.epicsWithoutStories || [],
      uncoveredFrIds,
      isolatedFrIds,
      uncoveredAcKeys,
      coverageComplete: coverageMeta.coverageComplete,
      generationSucceeded: coverageMeta.generationSucceeded,
      approvableHint: coverageMeta.approvableHint,
      qualityIssues: allQualityIssues,
      clarifications: allClarifications,
      needsReview,
      repairAttempts,
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
  stampWbsDepth,
  resolveLeafSuggestedRole,
  resolveLeafDeliverable,
  dedupeWbsLeaves,
  isHowWbsLlmEnabled,
  normalizeStoriesForWbs,
  normalizeClarifications,
  acRefAllowed,
  normalizeAcKey,
  acCitationCoversWhitelist,
  extractAcLines,
  parseAcIndexCitation,
  resolveAcRefToWhitelist,
  assessInputReadiness,
  assessDecompositionQuality,
  formatRepairFeedback,
};
