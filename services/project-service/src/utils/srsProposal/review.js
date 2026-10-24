/**
 * BA review summary + NEEDS_CONFIRMATION accept rules + reviewComplete.
 */

const DECISION_ACCEPT = 'accept';
const DECISION_EDIT = 'edit';
const DECISION_REJECT = 'reject';
const DECISION_CREATE = 'create';

function pushBacklogStructureItem(items, row, kind) {
  const logicalId = String(row?.logicalId || row?.id || '').trim();
  if (!logicalId) return;
  items.push({
    section: 'backlogStructure',
    logicalId,
    status: row.status || 'PROPOSED',
    // BA must decide Epic/Story the same way as FR before Gate 1 is complete.
    blocking: true,
    item: row,
    kind,
  });
}

function listProposalItems(proposal) {
  const generated = proposal?.generated || {};
  const items = [];
  for (const [section, block] of Object.entries(generated)) {
    if (
      section === 'synthesis' ||
      section === '_legacySynthesisDisplay' ||
      section === 'backlogStructure'
    ) {
      continue;
    }
    if (!block || typeof block !== 'object') continue;
    for (const it of block.items || []) {
      items.push({
        section,
        logicalId: it.logicalId || it.id,
        status: it.status,
        blocking: it.status === 'NEEDS_CONFIRMATION' || section === 'functionalRequirements',
        item: it,
      });
    }
    for (const cq of block.clarificationQuestions || []) {
      items.push({
        section,
        logicalId: cq.logicalId || cq.id,
        status: cq.status || 'NEEDS_CONFIRMATION',
        blocking: true,
        item: cq,
        kind: 'clarification',
      });
    }
  }

  const tree = generated.backlogStructure;
  if (tree && typeof tree === 'object') {
    for (const epic of Array.isArray(tree.epics) ? tree.epics : []) {
      pushBacklogStructureItem(items, epic, 'epic');
    }
    for (const story of Array.isArray(tree.stories) ? tree.stories : []) {
      pushBacklogStructureItem(items, story, 'story');
    }
  }
  return items;
}

function mergeEditedRow(row, logicalId, editedPayload) {
  if (String(row?.logicalId || row?.id) !== String(logicalId)) return row;
  const next = { ...row, ...editedPayload };
  if (editedPayload.title != null && editedPayload.name == null) {
    next.name = editedPayload.title;
  }
  return next;
}

/**
 * Project a BA edit onto generated.items, or Epic/Story rows (no .items array).
 */
function projectGeneratedEdit(generated, section, logicalId, editedPayload) {
  if (!generated || !editedPayload || typeof editedPayload !== 'object') return;
  const block = generated[section];
  if (!block || typeof block !== 'object') return;
  if (Array.isArray(block.items)) {
    block.items = block.items.map((it) => mergeEditedRow(it, logicalId, editedPayload));
  }
  if (section !== 'backlogStructure') return;
  if (Array.isArray(block.epics)) {
    block.epics = block.epics.map((it) => mergeEditedRow(it, logicalId, editedPayload));
  }
  if (Array.isArray(block.stories)) {
    block.stories = block.stories.map((it) => mergeEditedRow(it, logicalId, editedPayload));
  }
}

/**
 * @param {object} proposal
 * @returns {{ totalItems: number, accepted: number, edited: number, rejected: number, pending: number, blockingPending: number, complete: boolean }}
 */
function computeReviewSummary(proposal) {
  const items = listProposalItems(proposal);
  const decisions = proposal?.review?.decisions || {};
  let accepted = 0;
  let edited = 0;
  let rejected = 0;
  let pending = 0;
  let blockingPending = 0;

  for (const row of items) {
    const d = decisions[row.logicalId];
    const action = String(d?.action || '').toLowerCase();
    if (action === DECISION_ACCEPT) accepted += 1;
    else if (action === DECISION_EDIT || action === DECISION_CREATE) edited += 1;
    else if (action === DECISION_REJECT) rejected += 1;
    else {
      pending += 1;
      if (row.blocking) blockingPending += 1;
    }
  }

  return {
    totalItems: items.length,
    accepted,
    edited,
    rejected,
    pending,
    blockingPending,
    complete: blockingPending === 0 && items.length > 0,
  };
}

/**
 * NEEDS_CONFIRMATION: Accept requires decision.note + decision.resolution (or Edit first).
 * @param {{ action: string, note?: string, resolution?: string }} decision
 * @param {{ status?: string }} item
 */
function assertNeedsConfirmationAccept(decision, item) {
  const status = String(item?.status || '').toUpperCase();
  const action = String(decision?.action || '').toLowerCase();
  if (status !== 'NEEDS_CONFIRMATION' || action !== DECISION_ACCEPT) return;
  const note = String(decision?.note || '').trim();
  const resolution = String(decision?.resolution || '').trim();
  if (!note || !resolution) {
    const err = new Error(
      'NEEDS_CONFIRMATION accept requires decision.note and decision.resolution (or Edit first)'
    );
    err.statusCode = 400;
    err.errorCode = 'NEEDS_CONFIRMATION_ACCEPT_REQUIRES_NOTE_RESOLUTION';
    throw err;
  }
}

/**
 * Apply one BA decision with CAS on reviewVersion.
 */
function applyReviewDecision(proposal, logicalId, decision, opts = {}) {
  if (!proposal || typeof proposal !== 'object') {
    const err = new Error('srsProposal required');
    err.statusCode = 400;
    throw err;
  }
  const expectedReviewVersion = opts.expectedReviewVersion;
  if (
    expectedReviewVersion != null &&
    Number(proposal.reviewVersion || 0) !== Number(expectedReviewVersion)
  ) {
    const err = new Error('Stale reviewVersion');
    err.statusCode = 409;
    err.errorCode = 'STALE_REVIEW_VERSION';
    throw err;
  }

  const items = listProposalItems(proposal);
  const row = items.find((x) => x.logicalId === logicalId);
  if (!row) {
    const err = new Error(`Unknown proposal item: ${logicalId}`);
    err.statusCode = 404;
    err.errorCode = 'PROPOSAL_ITEM_NOT_FOUND';
    throw err;
  }

  assertNeedsConfirmationAccept(decision, row.item);

  const next = JSON.parse(JSON.stringify(proposal));
  next.review = next.review || { decisions: {}, locks: {}, summary: {} };
  next.review.decisions = { ...(next.review.decisions || {}) };
  // Projection only — prefer gateReviewCommands for immutable revision + audit (Wave A).
  next.review.decisions[logicalId] = {
    action: String(decision.action || '').toLowerCase(),
    note: decision.note || null,
    resolution: decision.resolution || null,
    editedPayload: decision.editedPayload || null,
    revisionId: decision.revisionId || opts.revisionId || null,
    at: new Date().toISOString(),
    by: opts.userId || null,
  };
  if (decision.action === 'edit' && decision.editedPayload && row.section) {
    projectGeneratedEdit(next.generated, row.section, logicalId, decision.editedPayload);
  }
  next.reviewVersion = Number(next.reviewVersion || 0) + 1;
  next.review.summary = computeReviewSummary(next);
  return next;
}

function isReviewComplete(proposal) {
  return Boolean(computeReviewSummary(proposal).complete);
}

module.exports = {
  DECISION_ACCEPT,
  DECISION_EDIT,
  DECISION_REJECT,
  DECISION_CREATE,
  listProposalItems,
  projectGeneratedEdit,
  computeReviewSummary,
  assertNeedsConfirmationAccept,
  applyReviewDecision,
  isReviewComplete,
};
