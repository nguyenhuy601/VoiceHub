/**
 * Deterministic backlog from FR + epic map (one-shot FR+epic SoT).
 * RULE-E1: Story title/AC = FR; no LLM story text.
 * RULE-E2/E3: parentEpicId null or ∈ epics; epic must have ≥1 FR after derive.
 */

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

/**
 * Temporary fr-from-cr chunk disambiguation: `c0-EPIC-IOT` → `EPIC-IOT`.
 * Only strips a leading `c{digits}-` so stable epic keys stay readable in Gate1/WBS titles.
 */
function stripChunkIdPrefix(raw) {
  return String(raw || '').replace(/^c\d+-/i, '');
}

/**
 * Epic display name: never keep chunk prefix; never fall back to prefixed id.
 * @param {unknown} rawName
 * @param {unknown} rawTitle
 * @param {string} id — may still carry `cN-` before finalize
 */
function epicDisplayName(rawName, rawTitle, id) {
  const cleanId = stripChunkIdPrefix(id) || id;
  let name = truncate(rawName || rawTitle || '', NAME_MAX);
  if (!name) return cleanId;
  if (name === id || name === cleanId) return cleanId;
  if (/^c\d+-/i.test(name)) {
    const stripped = stripChunkIdPrefix(name);
    if (stripped) return stripped;
  }
  return name;
}

/** Slug key for cross-chunk epic name merge (R1). */
function normalizeEpicNameKey(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Drop temporary `cN-` from reconciled epic ids/names; remap FR parentEpicId.
 * Collision (two themes both strip to EPIC-1): keep prefixed id for the duplicate.
 *
 * @param {object[]} epics
 * @param {object[]} items
 * @param {Record<string, string>} idRemap
 */
function finalizeEpicIdsAfterChunkReconcile(epics = [], items = [], idRemap = {}) {
  const used = new Set();
  /** @type {Record<string, string>} */
  const finalRemap = { ...idRemap };

  for (const epic of epics) {
    if (!epic || typeof epic !== 'object') continue;
    const oldId = normalizeRef(epic.id);
    if (!oldId) continue;
    let nextId = stripChunkIdPrefix(oldId) || oldId;
    if (used.has(nextId) && nextId !== oldId) {
      nextId = oldId;
    }
    used.add(nextId);

    const prevName = truncate(epic.name || epic.title || '', NAME_MAX);
    epic.name = epicDisplayName(prevName, '', oldId);
    if (epic.name === oldId || epic.name === stripChunkIdPrefix(oldId)) {
      epic.name = nextId;
    }
    epic.id = nextId;
    finalRemap[oldId] = nextId;
  }

  // Collapse remap chains (c1-EPIC-X → c0-EPIC-X → EPIC-X).
  for (const key of Object.keys(finalRemap)) {
    let cur = finalRemap[key];
    const seen = new Set([key]);
    while (cur && finalRemap[cur] && finalRemap[cur] !== cur && !seen.has(cur)) {
      seen.add(cur);
      cur = finalRemap[cur];
    }
    if (cur) finalRemap[key] = cur;
  }

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const pid = normalizeRef(item.parentEpicId);
    if (pid && finalRemap[pid]) {
      item.parentEpicId = finalRemap[pid];
    }
  }

  return { epics, items, idRemap: finalRemap };
}

/**
 * Merge epics across CR chunks by normalized name; remap parentEpicId on FR items.
 * First-win epic.id; first-win name (prefer longer if canonical name empty).
 * After merge, strip temporary `cN-` chunk prefixes from epic id/title (Gate1 «Tiêu đề Epic»).
 *
 * @param {{ epics?: object[], items?: object[] }[]} chunkResults
 * @returns {{
 *   epics: object[],
 *   items: object[],
 *   epicReconcileMerged: number,
 *   idRemap: Record<string, string>,
 * }}
 */
function reconcileEpicsAcrossChunks(chunkResults = []) {
  const chunks = Array.isArray(chunkResults) ? chunkResults : [];
  /** @type {Map<string, { id: string, name: string, description?: string, sourceFrIds: string[], storyIds: string[], rationale?: string }>} */
  const byKey = new Map();
  /** @type {Record<string, string>} */
  const idRemap = {};
  let epicReconcileMerged = 0;

  const allItems = [];

  for (const chunk of chunks) {
    const epics = Array.isArray(chunk?.epics) ? chunk.epics : [];
    const items = Array.isArray(chunk?.items) ? chunk.items : [];

    for (const raw of epics) {
      if (!raw || typeof raw !== 'object') continue;
      const id = normalizeRef(raw.id || raw.epicId);
      if (!id) continue;
      const name = epicDisplayName(raw.name, raw.title, id);
      const key = normalizeEpicNameKey(name) || `id:${stripChunkIdPrefix(id) || id}`;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, {
          id,
          name,
          description: truncate(raw.description || raw.goal || '', DESC_MAX) || undefined,
          sourceFrIds: Array.isArray(raw.sourceFrIds)
            ? raw.sourceFrIds.map(normalizeRef).filter(Boolean)
            : [],
          storyIds: Array.isArray(raw.storyIds)
            ? raw.storyIds.map(normalizeRef).filter(Boolean)
            : [],
          rationale: truncate(raw.rationale || '', 200) || undefined,
        });
        idRemap[id] = id;
      } else {
        epicReconcileMerged += 1;
        idRemap[id] = existing.id;
        if ((!existing.name || existing.name === existing.id || existing.name === stripChunkIdPrefix(existing.id)) && name && name !== id && name !== existing.id) {
          existing.name = name;
        } else if (name.length > String(existing.name || '').length) {
          // Prefer longer descriptive title when both present
          if (!existing.name || existing.name === existing.id || existing.name === stripChunkIdPrefix(existing.id)) {
            existing.name = name;
          }
        }
        if (!existing.description && raw.description) {
          existing.description = truncate(raw.description, DESC_MAX);
        }
      }
    }

    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      let parentEpicId =
        item.parentEpicId === undefined || item.parentEpicId === null || item.parentEpicId === ''
          ? null
          : normalizeRef(item.parentEpicId);
      if (parentEpicId && idRemap[parentEpicId]) {
        parentEpicId = idRemap[parentEpicId];
      }
      allItems.push({ ...item, parentEpicId });
    }
  }

  const epics = [...byKey.values()].map((e) => {
    const out = { ...e };
    if (!out.description) delete out.description;
    if (!out.rationale) delete out.rationale;
    return out;
  });

  const finalized = finalizeEpicIdsAfterChunkReconcile(epics, allItems, idRemap);
  return {
    epics: finalized.epics,
    items: finalized.items,
    epicReconcileMerged,
    idRemap: finalized.idRemap,
  };
}

/**
 * @param {object[]} frItems — FR rows with parentEpicId
 * @param {object[]} epicsCatalog
 * @param {{ backlogSource?: string }} [opts]
 * @returns {{ ok: true, backlogStructure: object } | { ok: false, errors: string[] }}
 */
function deriveBacklogFromFrEpics(frItems = [], epicsCatalog = [], opts = {}) {
  const items = Array.isArray(frItems) ? frItems : [];
  const catalog = Array.isArray(epicsCatalog) ? epicsCatalog : [];

  const epics = [];
  const epicIds = new Set();
  for (const raw of catalog) {
    if (!raw || typeof raw !== 'object') continue;
    const rawId = normalizeRef(raw.id || raw.epicId);
    if (!rawId) continue;
    const id = stripChunkIdPrefix(rawId) || rawId;
    if (epicIds.has(id)) continue;
    epicIds.add(id);
    const name = epicDisplayName(raw.name, raw.title, rawId);
    epics.push({
      id,
      name,
      description: truncate(raw.description || raw.goal || '', DESC_MAX) || undefined,
      sourceFrIds: [],
      storyIds: [],
      rationale: truncate(raw.rationale || '', 200) || undefined,
    });
    const last = epics[epics.length - 1];
    if (!last.description) delete last.description;
    if (!last.rationale) delete last.rationale;
  }

  const stories = [];
  const errors = [];

  for (let i = 0; i < items.length; i += 1) {
    const row = items[i];
    if (!row || typeof row !== 'object') {
      errors.push(`fr_${i}_invalid`);
      continue;
    }
    const id = normalizeRef(row.id || row.logicalId || row.frId);
    if (!id) {
      errors.push(`fr_${i}_missing_id`);
      continue;
    }

    let parentEpicId =
      row.parentEpicId === undefined || row.parentEpicId === null || row.parentEpicId === ''
        ? null
        : stripChunkIdPrefix(normalizeRef(row.parentEpicId)) ||
          normalizeRef(row.parentEpicId);

    if (parentEpicId != null && !epicIds.has(parentEpicId)) {
      errors.push(`orphan_parentEpicId_${id}`, `received=${parentEpicId}`);
      continue;
    }

    // Fail-closed when map is required but missing (caller may allow all-null root stories).
    if (
      opts.requireParentEpicId === true &&
      (parentEpicId === null || parentEpicId === undefined)
    ) {
      errors.push(`missing_parentEpicId_${id}`);
      continue;
    }

    const name = truncate(row.name || row.title || id, NAME_MAX) || id;
    const acRaw = row.ac || row.acceptanceCriteria || '';
    const acRefs = Array.isArray(acRaw)
      ? acRaw.map((x) => truncate(x, AC_CHARS)).filter(Boolean)
      : String(acRaw || '')
          .split(/\n|;/)
          .map((s) => truncate(s, AC_CHARS))
          .filter(Boolean);

    stories.push({
      id,
      name,
      description: truncate(row.description || '', DESC_MAX) || undefined,
      parentEpicId,
      sourceFrIds: [id],
      acRefs,
      needsDecomposition: true,
    });
    const last = stories[stories.length - 1];
    if (!last.description) delete last.description;
  }

  if (errors.length) {
    return { ok: false, errors };
  }

  const keptEpics = [];
  for (const epic of epics) {
    const kids = stories.filter((s) => s.parentEpicId === epic.id);
    if (!kids.length) {
      // RULE-E3: empty epic after derive → reject
      return {
        ok: false,
        errors: [`epic_without_fr_${epic.id}`],
      };
    }
    epic.storyIds = kids.map((s) => s.id);
    epic.sourceFrIds = kids.map((s) => s.id);
    keptEpics.push(epic);
  }

  const backlogSource = opts.backlogSource || 'derived_from_fr_epic';
  return {
    ok: true,
    backlogStructure: {
      epics: keptEpics,
      stories,
      features: [],
      unmappedFrIds: [],
      openQuestions: [],
      meta: {
        backlogSource,
        shapeVersion: 'fr-epic-derive-v1',
        epicCount: keptEpics.length,
        storyCount: stories.length,
      },
    },
  };
}

/**
 * True when every FR already has parentEpicId set (null root counts as mapped).
 * Missing key / undefined → needs assign.
 */
function frItemsHaveEpicMap(frItems = []) {
  const items = Array.isArray(frItems) ? frItems : [];
  if (!items.length) return false;
  return items.every((row) => {
    if (!row || typeof row !== 'object') return false;
    return Object.prototype.hasOwnProperty.call(row, 'parentEpicId');
  });
}

module.exports = {
  normalizeEpicNameKey,
  stripChunkIdPrefix,
  epicDisplayName,
  finalizeEpicIdsAfterChunkReconcile,
  reconcileEpicsAcrossChunks,
  deriveBacklogFromFrEpics,
  frItemsHaveEpicMap,
};
