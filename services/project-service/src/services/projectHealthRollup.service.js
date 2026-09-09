/**
 * Một aggregate Task theo projectId — phục vụ Director portfolio (không N+1).
 */
const mongoose = require('../db');
const Task = require('../models/Task');
const { withProgressPercents } = require('../utils/governance/directorHealth');

const CLOSED_CARD_STATUSES = ['done', 'cancelled'];

function roundHours(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100) / 100;
}

function toObjectIds(ids = []) {
  return (ids || [])
    .map((id) => String(id || '').trim())
    .filter((id) => mongoose.isValidObjectId(id))
    .map((id) => new mongoose.Types.ObjectId(id));
}

function doneWithCycleExpr() {
  return {
    $and: [
      { $eq: ['$status', 'done'] },
      { $ne: [{ $ifNull: ['$firstInProgressAt', null] }, null] },
      { $ne: [{ $ifNull: ['$completedAt', null] }, null] },
    ],
  };
}

function inActiveSprintExpr(activeSprintOids) {
  if (!activeSprintOids.length) {
    return { $literal: false };
  }
  return { $in: ['$sprintId', activeSprintOids] };
}

async function loadProjectCardProgress({
  organizationId,
  projectIds,
  asOf = new Date(),
  activeSprintIds = [],
} = {}) {
  const map = new Map();
  const org = String(organizationId || '').trim();
  const ids = (projectIds || [])
    .map((id) => String(id || '').trim())
    .filter((id) => mongoose.isValidObjectId(id));
  if (!ids.length || !mongoose.isValidObjectId(org)) return map;

  const now = asOf instanceof Date && !Number.isNaN(asOf.getTime()) ? asOf : new Date();
  const activeSprintOids = toObjectIds(activeSprintIds);
  const inSprint = inActiveSprintExpr(activeSprintOids);
  const hasCycle = doneWithCycleExpr();

  const rows = await Task.aggregate([
    {
      $match: {
        organizationId: new mongoose.Types.ObjectId(org),
        isActive: true,
        projectId: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) },
      },
    },
    {
      $group: {
        _id: '$projectId',
        totalCards: { $sum: 1 },
        doneCards: {
          $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] },
        },
        cancelledCards: {
          $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] },
        },
        openCards: {
          $sum: {
            $cond: [{ $not: { $in: ['$status', CLOSED_CARD_STATUSES] } }, 1, 0],
          },
        },
        overdueCards: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $ne: ['$dueDate', null] },
                  { $lt: ['$dueDate', now] },
                  { $not: { $in: ['$status', CLOSED_CARD_STATUSES] } },
                ],
              },
              1,
              0,
            ],
          },
        },
        estimateHoursDone: {
          $sum: {
            $cond: [
              {
                $and: [{ $eq: ['$status', 'done'] }, { $gt: ['$estimateHours', 0] }],
              },
              '$estimateHours',
              0,
            ],
          },
        },
        estimateHoursOpen: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $not: { $in: ['$status', CLOSED_CARD_STATUSES] } },
                  { $gt: ['$estimateHours', 0] },
                ],
              },
              '$estimateHours',
              0,
            ],
          },
        },
        cycleTimeHoursSum: {
          $sum: {
            $cond: [
              hasCycle,
              {
                $divide: [{ $subtract: ['$completedAt', '$firstInProgressAt'] }, 3600000],
              },
              0,
            ],
          },
        },
        cycleTimeSample: {
          $sum: { $cond: [hasCycle, 1, 0] },
        },
        sprintCommittedCards: {
          $sum: { $cond: [inSprint, 1, 0] },
        },
        sprintDoneCards: {
          $sum: {
            $cond: [{ $and: [inSprint, { $eq: ['$status', 'done'] }] }, 1, 0],
          },
        },
        sprintCommittedHours: {
          $sum: {
            $cond: [
              { $and: [inSprint, { $gt: ['$estimateHours', 0] }] },
              '$estimateHours',
              0,
            ],
          },
        },
        sprintCompletedHours: {
          $sum: {
            $cond: [
              {
                $and: [inSprint, { $eq: ['$status', 'done'] }, { $gt: ['$estimateHours', 0] }],
              },
              '$estimateHours',
              0,
            ],
          },
        },
      },
    },
  ]);

  for (const row of rows || []) {
    const pid = String(row?._id || '');
    if (!pid) continue;
    map.set(
      pid,
      withProgressPercents({
        totalCards: Number(row.totalCards) || 0,
        doneCards: Number(row.doneCards) || 0,
        cancelledCards: Number(row.cancelledCards) || 0,
        openCards: Number(row.openCards) || 0,
        overdueCards: Number(row.overdueCards) || 0,
        estimateHoursDone: roundHours(row.estimateHoursDone),
        estimateHoursOpen: roundHours(row.estimateHoursOpen),
        cycleTimeHoursSum: Number(row.cycleTimeHoursSum) || 0,
        cycleTimeSample: Number(row.cycleTimeSample) || 0,
        sprintCommittedCards: Number(row.sprintCommittedCards) || 0,
        sprintDoneCards: Number(row.sprintDoneCards) || 0,
        sprintCommittedHours: roundHours(row.sprintCommittedHours),
        sprintCompletedHours: roundHours(row.sprintCompletedHours),
      })
    );
  }
  return map;
}

module.exports = {
  loadProjectCardProgress,
};
