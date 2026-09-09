/**
 * Pure helpers for GET /tasks?view=calendar filter + projection.
 */

const CALENDAR_TASK_SELECT =
  '_id title status priority dueDate startDate estimateHours assigneeId assignments boardId projectId organizationId listId';

const CALENDAR_CLIENT_FIELDS = [
  '_id',
  'id',
  'title',
  'status',
  'priority',
  'dueDate',
  'startDate',
  'estimateHours',
  'assigneeId',
  'boardId',
  'projectId',
  'organizationId',
  'listId',
];

/**
 * Assignee-only (primary or assignments[].userId). No createdBy.
 * @param {string} userId
 */
function buildCalendarAssigneeClause(userId) {
  const uid = String(userId || '').trim();
  return {
    $or: [{ assigneeId: uid }, { 'assignments.userId': uid }],
  };
}

/**
 * Card window overlaps [from, to] using startDate/dueDate (either may be null).
 * @param {Date} from
 * @param {Date} to
 */
function buildCalendarOverlapClause(from, to) {
  return {
    $or: [
      {
        startDate: { $ne: null, $lte: to },
        dueDate: { $ne: null, $gte: from },
      },
      {
        $and: [
          {
            $or: [{ startDate: null }, { startDate: { $exists: false } }],
          },
          { dueDate: { $ne: null, $gte: from, $lte: to } },
        ],
      },
      {
        $and: [
          {
            $or: [{ dueDate: null }, { dueDate: { $exists: false } }],
          },
          { startDate: { $ne: null, $gte: from, $lte: to } },
        ],
      },
    ],
  };
}

/**
 * @param {{ userId: string, organizationId?: string|null, visibilityFilter?: object|null, from: Date, to: Date }} opts
 */
function buildCalendarTaskFilter(opts) {
  const userId = String(opts.userId || '').trim();
  const from = opts.from;
  const to = opts.to;
  const parts = [{ isActive: true }, buildCalendarAssigneeClause(userId), buildCalendarOverlapClause(from, to)];

  if (opts.organizationId) {
    parts.push({ organizationId: String(opts.organizationId) });
  }

  const visibility = opts.visibilityFilter;
  if (visibility && typeof visibility === 'object') {
    const { isActive: _ia, ...visRest } = visibility;
    if (Object.keys(visRest).length) {
      parts.push(visRest);
    }
  }

  return { $and: parts };
}

function pickCalendarTaskFields(task) {
  if (!task || typeof task !== 'object') return task;
  const out = {};
  for (const key of CALENDAR_CLIENT_FIELDS) {
    if (task[key] !== undefined) out[key] = task[key];
  }
  return out;
}

function toDateKeyUTC(d) {
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  const y = x.getUTCFullYear();
  const m = String(x.getUTCMonth() + 1).padStart(2, '0');
  const day = String(x.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

module.exports = {
  CALENDAR_TASK_SELECT,
  CALENDAR_CLIENT_FIELDS,
  buildCalendarAssigneeClause,
  buildCalendarOverlapClause,
  buildCalendarTaskFilter,
  pickCalendarTaskFields,
  toDateKeyUTC,
};
