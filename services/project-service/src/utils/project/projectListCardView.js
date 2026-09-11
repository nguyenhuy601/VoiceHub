/**
 * Slim list projection for landing/picker cards (GET /projects?view=card).
 */

const CARD_VIEW_ALIASES = new Set(['card', 'list_card']);

/** Mongo select for Project.find when view=card (access + card whitelist + heal). */
const CARD_LIST_PROJECT_SELECT = [
  '_id',
  'organizationId',
  'title',
  'projectCode',
  'description',
  'status',
  'priority',
  'visibility',
  'visibilityMode',
  'visibilityPolicy',
  'informationLevelOverrides',
  'startDate',
  'expectedEndDate',
  'dueDate',
  'relatedDepartmentIds',
  'isActive',
  'createdBy',
  'createdAt',
].join(' ');

function isCardListView(view) {
  return CARD_VIEW_ALIASES.has(String(view || '').trim().toLowerCase());
}

/**
 * Whitelist fields for project list cards (Tier 1–2 + enter path).
 * @param {object} payload — full list item after access + summary attach
 * @returns {object}
 */
function toProjectListCardItem(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const id = String(p._id || p.projectId || '').trim();
  const related = Array.isArray(p.relatedDepartmentIds) ? p.relatedDepartmentIds : [];
  const accessIn = p.access && typeof p.access === 'object' ? p.access : {};
  const membershipIn = p.myMembership && typeof p.myMembership === 'object' ? p.myMembership : {};
  const pmIn = p.pm && typeof p.pm === 'object' ? p.pm : null;

  const memberCount = Number(p.memberCount ?? p.membersCount ?? 0) || 0;
  const progressRaw = p.progressPercent;
  const progressPercent =
    progressRaw == null || progressRaw === ''
      ? null
      : Number.isFinite(Number(progressRaw))
        ? Math.round(Number(progressRaw))
        : null;

  return {
    _id: id || p._id,
    projectId: String(p.projectId || id).trim() || id,
    organizationId: p.organizationId != null ? String(p.organizationId) : undefined,
    title: p.title != null ? String(p.title) : '',
    projectCode: p.projectCode != null ? String(p.projectCode) : '',
    description: p.description != null ? String(p.description) : '',
    status: p.status != null ? String(p.status) : '',
    priority: p.priority != null ? String(p.priority) : '',
    visibility: p.visibility != null ? String(p.visibility) : 'private',
    startDate: p.startDate ?? null,
    expectedEndDate: p.expectedEndDate ?? null,
    dueDate: p.dueDate ?? null,
    relatedDepartmentIds: related,
    isActive: p.isActive !== false,
    defaultBoardId: p.defaultBoardId != null ? String(p.defaultBoardId) : null,
    memberCount,
    membersCount: memberCount,
    access: {
      discover: accessIn.discover !== false,
      informationLevel: String(accessIn.informationLevel || 'details'),
    },
    myMembership: {
      isMember: Boolean(membershipIn.isMember),
    },
    progressPercent,
    health: p.health != null ? String(p.health) : null,
    pm: pmIn && pmIn.userId
      ? {
          userId: String(pmIn.userId),
          displayName: String(pmIn.displayName || '').trim() || '—',
        }
      : null,
  };
}

module.exports = {
  isCardListView,
  toProjectListCardItem,
  CARD_VIEW_ALIASES,
  CARD_LIST_PROJECT_SELECT,
};
