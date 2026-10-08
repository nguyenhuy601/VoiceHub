/**
 * Opt-in slim projection for Hub bootstrap (GET /projects/:id?view=hub).
 * Default (no view) keeps full getProject payload.
 */

const HUB_VIEW_ALIASES = new Set(['hub']);

/** Heavy / nested keys Hub does not need on bootstrap (boards loaded via listBoards). */
const HUB_OMIT_KEYS = [
  'budgetStub',
  'budget',
  'closureSnapshot',
  'technicalSetup',
  'methodologySettings',
  'visibilityPolicy',
  'informationLevelOverrides',
  'uatSignOffNotes',
  'uatEvidence',
  'uatChecklist',
  'workflowDefinition',
  'workflowTransitions',
  'workflow',
];

function isHubView(view) {
  return HUB_VIEW_ALIASES.has(String(view || '').trim().toLowerCase());
}

function slimBoardRow(board) {
  if (!board || typeof board !== 'object') return null;
  const id = board._id != null ? String(board._id) : '';
  if (!id) return null;
  return {
    _id: id,
    title: board.title != null ? String(board.title) : '',
    isActive: board.isActive !== false,
  };
}

/**
 * @param {object} payload — full getProject result
 * @returns {object}
 */
function toProjectHubView(payload) {
  const p = payload && typeof payload === 'object' ? { ...payload } : {};
  for (const key of HUB_OMIT_KEYS) {
    delete p[key];
  }

  if (Array.isArray(p.boards)) {
    p.boards = p.boards.map(slimBoardRow).filter(Boolean);
  }

  // Keep scalar UAT/release flags Hub UI reads; drop nested dumps if present under aliases
  if (p.uatSignOff && typeof p.uatSignOff === 'object') {
    delete p.uatSignOff;
  }

  return p;
}

module.exports = {
  isHubView,
  toProjectHubView,
  HUB_VIEW_ALIASES,
  HUB_OMIT_KEYS,
};
