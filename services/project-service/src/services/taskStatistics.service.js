/**
 * Thống kê task/card theo org. GET /statistics giữ contract cũ;
 * view=dashboard thêm overdue / việc của tôi / sức khỏe board (gồm thẻ Kanban).
 */
const mongoose = require('../db');
const Task = require('../models/Task');
const TaskBoard = require('../models/TaskBoard');
const {
  DONE_STATUSES,
  formatStatusCounts,
  dashboardDateWindow,
  countFacet,
  buildDashboardVisibilityMatch,
  OVERDUE_ITEMS_LIMIT,
  formatOverdueItems,
} = require('./taskStatistics.helpers');

function toOid(value) {
  const s = String(value || '').trim();
  if (!mongoose.isValidObjectId(s)) return null;
  return new mongoose.Types.ObjectId(s);
}

function classicBoardIdFilter() {
  return String(process.env.TASK_BOARD_CARDS_IN_TASKS_API || '').toLowerCase().trim() === 'true'
    ? {}
    : { boardId: null };
}

async function getClassicStatusCounts(orgOid) {
  const stats = await Task.aggregate([
    {
      $match: {
        organizationId: orgOid,
        isActive: true,
        ...classicBoardIdFilter(),
      },
    },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  return formatStatusCounts(stats);
}

async function getDashboardStatistics({ orgOid, userId, scope }) {
  const userOid = toOid(userId);
  const { now, startToday, endWeek } = dashboardDateWindow();
  const visibility = buildDashboardVisibilityMatch(scope, userId, toOid);
  const match = {
    organizationId: orgOid,
    ...visibility,
    isActive: true,
  };

  const openStatusMatch = { status: { $nin: DONE_STATUSES } };
  const myAssignee = userOid ? { assigneeId: userOid } : { assigneeId: { $exists: false } };

  const [facet] = await Task.aggregate([
    { $match: match },
    {
      $facet: {
        byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
        overdue: [
          { $match: { ...openStatusMatch, dueDate: { $ne: null, $lt: now } } },
          { $count: 'n' },
        ],
        dueThisWeek: [
          {
            $match: {
              ...openStatusMatch,
              dueDate: { $gte: startToday, $lt: endWeek },
            },
          },
          { $count: 'n' },
        ],
        myOpen: [{ $match: { ...openStatusMatch, ...myAssignee } }, { $count: 'n' }],
        myOverdue: [
          {
            $match: {
              ...openStatusMatch,
              ...myAssignee,
              dueDate: { $ne: null, $lt: now },
            },
          },
          { $count: 'n' },
        ],
        myDueThisWeek: [
          {
            $match: {
              ...openStatusMatch,
              ...myAssignee,
              dueDate: { $gte: startToday, $lt: endWeek },
            },
          },
          { $count: 'n' },
        ],
        boards: [
          { $match: { boardId: { $ne: null } } },
          {
            $group: {
              _id: '$boardId',
              total: { $sum: 1 },
              done: {
                $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] },
              },
              open: {
                $sum: {
                  $cond: [{ $not: { $in: ['$status', DONE_STATUSES] } }, 1, 0],
                },
              },
              overdue: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $ne: ['$dueDate', null] },
                        { $lt: ['$dueDate', now] },
                        { $not: { $in: ['$status', DONE_STATUSES] } },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
            },
          },
          { $sort: { overdue: -1, open: -1, total: -1 } },
          { $limit: 5 },
        ],
        overdueItems: [
          { $match: { ...openStatusMatch, dueDate: { $ne: null, $lt: now } } },
          { $sort: { dueDate: 1 } },
          { $limit: OVERDUE_ITEMS_LIMIT },
          {
            $project: {
              title: 1,
              dueDate: 1,
              boardId: 1,
              assigneeId: 1,
              organizationId: 1,
            },
          },
        ],
      },
    },
  ]);

  const counts = formatStatusCounts(facet?.byStatus);
  const openCount = Math.max(0, counts.total - counts.done - counts.cancelled);

  const boardRows = Array.isArray(facet?.boards) ? facet.boards : [];
  const overdueRaw = Array.isArray(facet?.overdueItems) ? facet.overdueItems : [];
  const boardIds = [
    ...boardRows.map((row) => row._id),
    ...overdueRaw.map((row) => row.boardId),
  ].filter(Boolean);
  let titleById = new Map();
  if (boardIds.length) {
    const boards = await TaskBoard.find({ _id: { $in: boardIds } })
      .select('title')
      .lean();
    titleById = new Map(
      boards.map((b) => [
        String(b._id),
        String(b.title || '').trim() || String(b._id),
      ])
    );
  }

  const orgIdStr = String(orgOid);
  return {
    ...counts,
    openCount,
    overdue: countFacet(facet?.overdue),
    dueThisWeek: countFacet(facet?.dueThisWeek),
    myOpen: countFacet(facet?.myOpen),
    myOverdue: countFacet(facet?.myOverdue),
    myDueThisWeek: countFacet(facet?.myDueThisWeek),
    boards: boardRows.map((row) => ({
      id: String(row._id),
      name: titleById.get(String(row._id)) || String(row._id),
      total: Number(row.total) || 0,
      done: Number(row.done) || 0,
      open: Number(row.open) || 0,
      overdue: Number(row.overdue) || 0,
    })),
    overdueItems: formatOverdueItems(overdueRaw, titleById, orgIdStr),
    membershipRole: scope?.membershipRole ? String(scope.membershipRole) : null,
  };
}

async function getTaskStatistics({ orgOid, userId, scope, view }) {
  const normalizedView = String(view || '').trim().toLowerCase();
  if (normalizedView === 'dashboard') {
    return getDashboardStatistics({ orgOid, userId, scope });
  }
  return getClassicStatusCounts(orgOid);
}

module.exports = {
  getClassicStatusCounts,
  getDashboardStatistics,
  getTaskStatistics,
};
