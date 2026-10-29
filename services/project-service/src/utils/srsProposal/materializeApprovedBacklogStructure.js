/**
 * Stamp analyses.approvedBacklogStructure from Gate1 draft when publishable.
 * Fail-closed: no Story=FR invent — requires shapeVersion backlog-structure (+ legacy mid-flag).
 * Stories must pass AC contract (acRefs non-empty + resolvable vs FR.AC).
 */

const { filterStoriesByAcContract } = require('./storyAcContract');

const BACKLOG_STRUCTURE_SHAPE = 'backlog-structure';
const LEGACY_BACKLOG_SHAPE = 'backlog-structure-v3';

function isPublishableBacklogStructure(structure) {
  const shape = structure?.meta?.shapeVersion;
  const shapeOk = shape === BACKLOG_STRUCTURE_SHAPE || shape === LEGACY_BACKLOG_SHAPE;
  return (
    structure &&
    typeof structure === 'object' &&
    shapeOk &&
    structure.meta?.publishable !== false &&
    !(Array.isArray(structure.identityReview) && structure.identityReview.length) &&
    Array.isArray(structure.stories) &&
    structure.stories.length > 0
  );
}

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
        ? null
        : String(item.parentEpicId).trim();
    const parentEpicId =
      parentRaw == null ? null : stripChunkIdPrefix(parentRaw) || parentRaw;

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
 * Count FR items that would be accepted (non-rejected) — used by Gate1 hard-gate.
 * @param {object|null} proposal
 * @returns {number}
 */
function countAcceptedFrItems(proposal) {
  return collectAcceptedFrAndEpics(proposal).accepted.length;
}

/**
 * @param {object|null} proposal — srsProposal
 * @returns {object|null}
 */
function materializeApprovedBacklogStructure(proposal) {
  const generated =
    proposal?.generated && typeof proposal.generated === 'object' ? proposal.generated : {};
  const draft = generated.backlogStructure;

  if (!isPublishableBacklogStructure(draft)) {
    if (draft && Array.isArray(draft.stories) && draft.stories.length) {
      console.warn(
        '[materializeApprovedBacklogStructure] backlog_not_publishable',
        draft.meta?.shapeVersion || 'missing_shape',
        draft.meta?.publishable === false ? 'not_publishable' : '',
        (draft.identityReview || []).length ? 'identity_review' : ''
      );
    }
    return null;
  }

  const { accepted: frItems } = collectAcceptedFrAndEpics(proposal);
  const filtered = filterStoriesByAcContract(draft.stories, frItems);
  if (!filtered.stories.length) {
    console.warn(
      '[materializeApprovedBacklogStructure] stories_fail_ac_contract',
      (filtered.reasonCodes || []).join(',') || 'MISSING_ACCEPTANCE_CRITERIA',
      `rejected=${filtered.rejected.length}`
    );
    return null;
  }

  const approvedBaselineVersion =
    draft.meta?.approvedBaselineVersion || `baseline-${Date.now().toString(36)}`;
  return {
    ...draft,
    stories: filtered.stories,
    meta: {
      ...draft.meta,
      source: 'gate1_approved',
      shapeVersion: BACKLOG_STRUCTURE_SHAPE,
      approvedAt: new Date().toISOString(),
      approvedBaselineVersion,
      acContractRejected: filtered.rejected.length
        ? filtered.rejected.slice(0, 40)
        : undefined,
      acContractReasonCodes: filtered.reasonCodes.length ? filtered.reasonCodes : undefined,
    },
  };
}

module.exports = {
  materializeApprovedBacklogStructure,
  collectAcceptedFrAndEpics,
  countAcceptedFrItems,
  isPublishableBacklogStructure,
  BACKLOG_STRUCTURE_SHAPE,
};
