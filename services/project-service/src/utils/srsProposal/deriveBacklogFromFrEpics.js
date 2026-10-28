/**
 * Twin of ai-project-planning-service deriveBacklogFromFrEpics (stamp on confirm).
 * Story = FR; fail-closed on orphan parentEpicId; empty epic → reject.
 */

function normalizeRef(raw) {
  return String(raw || '').trim();
}

function truncate(text, max) {
  const s = String(text || '').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

/** Temporary fr-from-cr chunk prefix: `c0-EPIC-IOT` → `EPIC-IOT`. */
function stripChunkIdPrefix(raw) {
  return String(raw || '').replace(/^c\d+-/i, '');
}

/** Drop temporary fr-from-cr chunk prefix from epic titles (`c0-EPIC-IOT` → `EPIC-IOT`). */
function cleanEpicTitle(name, id) {
  const raw = String(name || '').trim();
  const idStr = normalizeRef(id);
  const cleanId = stripChunkIdPrefix(idStr) || idStr;
  if (!raw || raw === idStr || raw === cleanId) return cleanId;
  if (/^c\d+-/i.test(raw)) return stripChunkIdPrefix(raw) || raw;
  return raw;
}

/**
 * @param {object[]} frItems
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
    epics.push({
      id,
      name: cleanEpicTitle(raw.name || raw.title, rawId),
      description: truncate(raw.description || raw.goal || '', 800) || undefined,
      sourceFrIds: [],
      storyIds: [],
    });
    if (!epics[epics.length - 1].description) delete epics[epics.length - 1].description;
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
        : stripChunkIdPrefix(normalizeRef(row.parentEpicId)) || normalizeRef(row.parentEpicId);

    if (parentEpicId != null && !epicIds.has(parentEpicId)) {
      errors.push(`orphan_parentEpicId_${id}`, `received=${parentEpicId}`);
      continue;
    }

    const name = truncate(row.name || row.title || id, 240) || id;
    const acRaw = row.ac || row.acceptanceCriteria || '';
    const acRefs = Array.isArray(acRaw)
      ? acRaw.map((x) => truncate(String(x), 400)).filter(Boolean)
      : String(acRaw || '')
          .split(/\n|;/)
          .map((s) => truncate(s, 400))
          .filter(Boolean);

    stories.push({
      id,
      name,
      description: truncate(row.description || '', 800) || undefined,
      parentEpicId,
      sourceFrIds: [id],
      acRefs,
      needsDecomposition: true,
    });
    if (!stories[stories.length - 1].description) delete stories[stories.length - 1].description;
  }

  if (errors.length) return { ok: false, errors };

  const keptEpics = [];
  for (const epic of epics) {
    const kids = stories.filter((s) => s.parentEpicId === epic.id);
    if (!kids.length) {
      return { ok: false, errors: [`epic_without_fr_${epic.id}`] };
    }
    epic.storyIds = kids.map((s) => s.id);
    epic.sourceFrIds = kids.map((s) => s.id);
    keptEpics.push(epic);
  }

  return {
    ok: true,
    backlogStructure: {
      epics: keptEpics,
      stories,
      features: [],
      unmappedFrIds: [],
      openQuestions: [],
      meta: {
        backlogSource: opts.backlogSource || 'derived_from_fr_epic',
        shapeVersion: 'fr-epic-derive-v1',
        source: 'gate1_approved',
        epicCount: keptEpics.length,
        storyCount: stories.length,
        approvedAt: new Date().toISOString(),
      },
    },
  };
}

module.exports = { deriveBacklogFromFrEpics };
