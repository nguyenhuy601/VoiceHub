/**
 * Stamp analyses.approvedBacklogStructure = re-derive from Gate1 FR decisions + epics catalog.
 * R5: do not require backlogStructure row decisions; Story = accepted FR.
 */

const { deriveBacklogFromFrEpics } = require('./deriveBacklogFromFrEpics');

/** Temporary fr-from-cr chunk prefix: `c0-EPIC-IOT` → `EPIC-IOT`. */
function stripChunkIdPrefix(raw) {
  return String(raw || '').replace(/^c\d+-/i, '');
}

/** Drop temporary fr-from-cr chunk prefix from epic titles (`c0-EPIC-IOT` → `EPIC-IOT`). */
function cleanEpicTitle(name, id) {
  const raw = String(name || '').trim();
  const idStr = String(id || '').trim();
  const cleanId = stripChunkIdPrefix(idStr) || idStr;
  if (!raw || raw === idStr || raw === cleanId) return cleanId;
  if (/^c\d+-/i.test(raw)) return stripChunkIdPrefix(raw) || raw;
  return raw;
}

function normalizeStructure(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const epics = Array.isArray(raw.epics) ? raw.epics : [];
  const stories = Array.isArray(raw.stories) ? raw.stories : [];
  if (!stories.length && !epics.length) return null;
  return {
    epics: epics
      .map((e) => {
        const rawId = String(e.id || '').trim();
        const id = stripChunkIdPrefix(rawId) || rawId;
        return {
          id,
          name: cleanEpicTitle(e.name || e.title, rawId),
          description: e.description || e.goal || undefined,
          sourceFrIds: Array.isArray(e.sourceFrIds) ? e.sourceFrIds.map(String) : [],
          storyIds: Array.isArray(e.storyIds) ? e.storyIds.map(String) : [],
          rationale: e.rationale || undefined,
        };
      })
      .filter((e) => e.id),
    stories: stories
      .map((s) => ({
        id: String(s.id || '').trim(),
        name: String(s.name || s.title || s.id || '').trim(),
        description: s.description || undefined,
        parentEpicId:
          s.parentEpicId === undefined || s.parentEpicId === null || s.parentEpicId === ''
            ? null
            : stripChunkIdPrefix(String(s.parentEpicId).trim()) ||
              String(s.parentEpicId).trim(),
        sourceFrIds: Array.isArray(s.sourceFrIds) ? s.sourceFrIds.map(String) : [],
        sourceUcIds: Array.isArray(s.sourceUcIds) ? s.sourceUcIds.map(String) : [],
        acRefs: Array.isArray(s.acRefs) ? s.acRefs.map(String) : [],
        needsDecomposition: s.needsDecomposition !== false,
        rationale: s.rationale || undefined,
      }))
      .filter((s) => s.id && Array.isArray(s.sourceFrIds) && s.sourceFrIds.length),
    features: [],
    unmappedFrIds: Array.isArray(raw.unmappedFrIds) ? raw.unmappedFrIds.map(String) : [],
    openQuestions: Array.isArray(raw.openQuestions) ? raw.openQuestions : [],
    meta: {
      ...(raw.meta && typeof raw.meta === 'object' ? raw.meta : {}),
      source: 'gate1_approved',
      approvedAt: new Date().toISOString(),
    },
  };
}

function isRejectedDecision(d) {
  const action = String(d?.action || '').toLowerCase();
  return action === 'reject' || action === 'rejected';
}

/**
 * Apply FR review decisions → accepted FR rows (edited title/AC/priority; keep parentEpicId).
 * Epic title edits from editedPayload.epicTitle update catalog names (R4/R7).
 */
function collectAcceptedFrAndEpics(proposal) {
  const generated = proposal?.generated && typeof proposal.generated === 'object'
    ? proposal.generated
    : {};
  const frItems = Array.isArray(generated.functionalRequirements?.items)
    ? generated.functionalRequirements.items
    : [];
  const decisions =
    proposal?.review?.decisions && typeof proposal.review.decisions === 'object'
      ? proposal.review.decisions
      : {};

  const epicCatalog = Array.isArray(generated.backlogStructure?.epics)
    ? generated.backlogStructure.epics.map((e) => {
        const rawId = String(e.id || '').trim();
        const id = stripChunkIdPrefix(rawId) || rawId;
        return {
          id,
          name: cleanEpicTitle(e.name || e.title, rawId),
          description: e.description || e.goal || undefined,
        };
      })
    : [];
  const epicById = new Map(epicCatalog.filter((e) => e.id).map((e) => [e.id, { ...e }]));

  const accepted = [];
  for (const item of frItems) {
    if (!item || typeof item !== 'object') continue;
    if (String(item.status || '').toUpperCase() === 'REJECTED') continue;
    const id = String(item.logicalId || item.id || '').trim();
    if (!id) continue;
    const d = decisions[id] || decisions[`functionalRequirements:${id}`];
    if (isRejectedDecision(d)) continue;

    const payload =
      d && String(d.action || '').toLowerCase() === 'edit' && d.editedPayload
        ? d.editedPayload
        : d && String(d.action || '').toLowerCase() === 'accept' && d.editedPayload
          ? d.editedPayload
          : d && String(d.action || '').toLowerCase() === 'create' && d.editedPayload
            ? d.editedPayload
            : null;

    const parentRaw =
      item.parentEpicId === undefined || item.parentEpicId === null || item.parentEpicId === ''
        ? item.parentEpicId === null
          ? null
          : null
        : String(item.parentEpicId).trim();
    const parentEpicId =
      parentRaw == null ? null : stripChunkIdPrefix(parentRaw) || parentRaw;

    // R4: epicTitle on FR edit → catalog only; never change parentEpicId.
    if (payload?.epicTitle != null && parentEpicId) {
      const title = cleanEpicTitle(payload.epicTitle, parentEpicId);
      if (title) {
        const epic = epicById.get(parentEpicId) || { id: parentEpicId, name: title };
        epic.name = title;
        epicById.set(parentEpicId, epic);
      }
    }

    accepted.push({
      id,
      logicalId: id,
      name: payload?.title || payload?.name || item.title || item.name || id,
      title: payload?.title || payload?.name || item.title || item.name || id,
      description:
        payload?.description != null ? payload.description : item.description || '',
      ac:
        payload?.ac != null
          ? payload.ac
          : payload?.acceptanceCriteria != null
            ? payload.acceptanceCriteria
            : item.ac || item.acceptanceCriteria || '',
      acceptanceCriteria:
        payload?.acceptanceCriteria != null
          ? payload.acceptanceCriteria
          : payload?.ac != null
            ? payload.ac
            : item.acceptanceCriteria || item.ac || '',
      priority: payload?.priority != null ? payload.priority : item.priority || null,
      parentEpicId,
    });
  }

  return { accepted, epics: [...epicById.values()] };
}

/**
 * @param {object|null} proposal — srsProposal
 * @returns {object|null}
 */
function materializeApprovedBacklogStructure(proposal) {
  const { accepted, epics } = collectAcceptedFrAndEpics(proposal);

  // Prefer re-derive from FR decisions (R5). Fallback to legacy tree filter if no FR items.
  if (accepted.length) {
    const derived = deriveBacklogFromFrEpics(accepted, epics, {
      backlogSource: 'derived_from_fr_epic',
    });
    if (derived.ok) {
      return {
        ...derived.backlogStructure,
        meta: {
          ...derived.backlogStructure.meta,
          source: 'gate1_approved',
          approvedAt: new Date().toISOString(),
        },
      };
    }
    // Fail-closed: do not invent stories from stale backlogStructure decisions.
    console.warn(
      '[materializeApprovedBacklogStructure] derive_fail',
      (derived.errors || []).join(',')
    );
    return null;
  }

  // Legacy packs without FR parentEpicId map — last-resort filter of stored tree.
  const raw = proposal?.generated?.backlogStructure;
  const normalized = normalizeStructure(raw);
  if (!normalized) return null;

  const decisions =
    proposal?.review?.decisions && typeof proposal.review.decisions === 'object'
      ? proposal.review.decisions
      : {};

  function isRejected(id) {
    const d = decisions[id] || decisions[`backlogStructure:${id}`];
    return isRejectedDecision(d);
  }

  const nextEpics = normalized.epics.filter((e) => !isRejected(e.id));
  const epicIds = new Set(nextEpics.map((e) => e.id));
  const stories = normalized.stories
    .filter((s) => !isRejected(s.id))
    .map((s) => {
      if (s.parentEpicId && !epicIds.has(s.parentEpicId)) {
        return { ...s, parentEpicId: null };
      }
      return s;
    });

  if (!stories.length) return null;

  for (const epic of nextEpics) {
    epic.storyIds = stories.filter((s) => s.parentEpicId === epic.id).map((s) => s.id);
  }

  return {
    ...normalized,
    epics: nextEpics,
    stories,
    meta: {
      ...normalized.meta,
      epicCount: nextEpics.length,
      storyCount: stories.length,
    },
  };
}

module.exports = {
  materializeApprovedBacklogStructure,
  normalizeStructure,
  collectAcceptedFrAndEpics,
};
