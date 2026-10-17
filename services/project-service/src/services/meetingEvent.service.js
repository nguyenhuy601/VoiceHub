const MeetingEvent = require('../models/MeetingEvent');
const MeetingChangeHistory = require('../models/MeetingChangeHistory');
const MeetingRecurrenceRule = require('../models/MeetingRecurrenceRule');
const MeetingPlan = require('../models/MeetingPlan');
const Project = require('../models/Project');
const { isProjectRbacEnabled } = require('../utils/project/projectPermissionMatrix');
const { assertUserProjectPermission } = require('./projectAccess.service');
const {
  participantPlannedHours,
  computeMeetingDemandForWeek,
  planExceedWarning,
  weekKeyFromDate,
} = require('../engines/allocation');
const {
  getPublishedOrBaseline,
} = require('./effortEstimationConfig.service');

async function assertProject(projectId) {
  const project = await Project.findById(projectId).lean();
  if (!project || project.isActive === false) {
    const err = new Error('Project không tồn tại');
    err.statusCode = 404;
    throw err;
  }
  return project;
}

async function assertPerm(userId, projectId, permission) {
  if (!isProjectRbacEnabled()) return;
  await assertUserProjectPermission({
    userId,
    projectId,
    permission,
    message: `Thiếu quyền ${permission}`,
  });
}

function serializeEvent(doc, { includeHistory = false } = {}) {
  if (!doc) return null;
  const o = doc.toObject ? doc.toObject() : { ...doc };
  const out = {
    id: String(o._id),
    organizationId: String(o.organizationId),
    projectId: String(o.projectId),
    title: o.title,
    startAt: o.startAt,
    endAt: o.endAt,
    status: o.status,
    customerExchangeStatus: o.customerExchangeStatus || 'n_a',
    source: o.source,
    planLineWeekKey: o.planLineWeekKey || '',
    recurrenceRuleId: o.recurrenceRuleId || '',
    participants: (o.participants || []).map((p) => ({
      userId: p.userId ? String(p.userId) : null,
      isExternal: Boolean(p.isExternal),
      externalName: p.externalName || '',
      externalEmail: p.externalEmail || '',
      externalCompany: p.externalCompany || '',
      externalRole: p.externalRole || '',
      attendanceStatus: p.attendanceStatus,
      plannedDurationMinutes: p.plannedDurationMinutes,
      actualDurationMinutes: p.actualDurationMinutes,
    })),
    overrideReason: o.overrideReason || '',
    exceedPlanAck: Boolean(o.exceedPlanAck),
    conflictOverrideReason: o.conflictOverrideReason || '',
    cancelDisposition: o.cancelDisposition || '',
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
  if (includeHistory) out._historyRequested = true;
  return out;
}

async function recordHistory({
  organizationId,
  projectId,
  eventId,
  action,
  actorUserId,
  reason = '',
  before = null,
  after = null,
}) {
  await MeetingChangeHistory.create({
    organizationId,
    projectId,
    eventId,
    action,
    actorUserId,
    reason: String(reason || '').slice(0, 500),
    before,
    after,
  });
}

function sanitizeParticipants(raw = []) {
  return (Array.isArray(raw) ? raw : []).slice(0, 64).map((p) => {
    const isExternal = Boolean(p.isExternal) || !p.userId;
    return {
      userId: isExternal ? null : p.userId,
      isExternal,
      externalName: String(p.externalName || '').trim().slice(0, 120),
      externalEmail: String(p.externalEmail || '').trim().slice(0, 160),
      externalCompany: String(p.externalCompany || '').trim().slice(0, 120),
      externalRole: String(p.externalRole || '').trim().slice(0, 80),
      attendanceStatus: p.attendanceStatus || 'invited',
      plannedDurationMinutes:
        p.plannedDurationMinutes != null ? Number(p.plannedDurationMinutes) : null,
      actualDurationMinutes:
        p.actualDurationMinutes != null ? Number(p.actualDurationMinutes) : null,
    };
  });
}

async function checkPlanExceed({ projectId, event }) {
  const weekKey =
    event.planLineWeekKey ||
    weekKeyFromDate(event.startAt, { tzOffsetHours: 7 }) ||
    '';
  const plan = await MeetingPlan.findOne({
    projectId,
    status: { $in: ['draft', 'confirmed'] },
  })
    .sort({ version: -1 })
    .lean();
  const config = await getPublishedOrBaseline(String(event.organizationId));
  const suggestPct = config.capacityPolicy?.planExceedSuggestChangePct ?? 20;

  const internals = (event.participants || []).filter((p) => !p.isExternal && p.userId);
  const warnings = [];
  for (const p of internals) {
    const hours = participantPlannedHours({
      startAt: event.startAt,
      endAt: event.endAt,
      plannedDurationMinutes: p.plannedDurationMinutes,
    });
    const roleLines = (plan?.lines || []).filter(
      (l) => l.weekKey === weekKey && (!l.userId || String(l.userId) === String(p.userId))
    );
    const planBudget = roleLines.reduce((s, l) => s + (Number(l.hours) || 0), 0);
    const others = await MeetingEvent.find({
      projectId,
      status: { $in: ['draft', 'scheduled', 'confirmed', 'completed'] },
      _id: { $ne: event._id },
      startAt: {
        $gte: new Date(`${weekKey}T00:00:00.000Z`),
        $lt: new Date(new Date(`${weekKey}T00:00:00.000Z`).getTime() + 7 * 86400000),
      },
      'participants.userId': p.userId,
    }).lean();
    const eventRows = others.map((ev) => {
      const part = (ev.participants || []).find((x) => String(x.userId) === String(p.userId));
      return {
        status: ev.status,
        plannedHours: participantPlannedHours({
          startAt: ev.startAt,
          endAt: ev.endAt,
          plannedDurationMinutes: part?.plannedDurationMinutes,
        }),
      };
    });
    eventRows.push({ status: event.status || 'scheduled', plannedHours: hours });
    const demand = computeMeetingDemandForWeek({
      planBudgetHours: planBudget,
      events: eventRows,
    });
    const warn = planExceedWarning({
      planBudget: demand.planBudget,
      forecastDemandMeet: demand.forecastDemandMeet,
      suggestChangePct: suggestPct,
    });
    if (warn.softWarn) {
      warnings.push({
        userId: String(p.userId),
        weekKey,
        ...warn,
        forecastDemandMeet: demand.forecastDemandMeet,
        planBudget: demand.planBudget,
      });
    }
  }
  return warnings;
}

/** Soft conflict: overlap with other project events for same user (MVP). */
async function checkSoftConflicts({ organizationId, event, excludeEventId = null }) {
  const conflicts = [];
  const internals = (event.participants || []).filter((p) => !p.isExternal && p.userId);
  for (const p of internals) {
    const q = {
      organizationId,
      status: { $in: ['draft', 'scheduled', 'confirmed'] },
      'participants.userId': p.userId,
      startAt: { $lt: event.endAt },
      endAt: { $gt: event.startAt },
    };
    if (excludeEventId) q._id = { $ne: excludeEventId };
    const hits = await MeetingEvent.find(q).select('title startAt endAt projectId').limit(10).lean();
    for (const h of hits) {
      conflicts.push({
        userId: String(p.userId),
        otherEventId: String(h._id),
        otherProjectId: String(h.projectId),
        title: h.title,
        startAt: h.startAt,
        endAt: h.endAt,
      });
    }
  }
  return conflicts;
}

async function listEvents({ userId, projectId, view = 'summary' }) {
  await assertProject(projectId);
  await assertPerm(userId, projectId, 'meeting:view');
  const rows = await MeetingEvent.find({ projectId }).sort({ startAt: 1 }).lean();
  const out = rows.map((r) => serializeEvent(r));
  if (view === 'full') {
    for (const ev of out) {
      const hist = await MeetingChangeHistory.find({ eventId: ev.id })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();
      ev.history = hist.map((h) => ({
        id: String(h._id),
        action: h.action,
        reason: h.reason,
        actorUserId: String(h.actorUserId),
        createdAt: h.createdAt,
      }));
    }
  }
  return out;
}

async function createEvent({ userId, projectId, body = {} }) {
  const project = await assertProject(projectId);
  await assertPerm(userId, projectId, 'meeting:create');
  const startAt = new Date(body.startAt);
  const endAt = new Date(body.endAt);
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) {
    const err = new Error('startAt/endAt không hợp lệ');
    err.statusCode = 400;
    throw err;
  }
  const participants = sanitizeParticipants(body.participants);
  const weekKey = weekKeyFromDate(startAt, { tzOffsetHours: 7 }) || '';
  const draft = {
    organizationId: project.organizationId,
    projectId,
    title: String(body.title || 'Meeting').trim().slice(0, 240),
    startAt,
    endAt,
    status: body.status || 'scheduled',
    customerExchangeStatus: body.customerExchangeStatus || 'n_a',
    source: body.source || 'manual',
    planLineWeekKey: body.planLineWeekKey || weekKey,
    participants,
    exceedPlanAck: Boolean(body.exceedPlanAck),
    overrideReason: String(body.overrideReason || '').slice(0, 500),
    conflictOverrideReason: String(body.conflictOverrideReason || '').slice(0, 500),
    createdBy: userId,
    updatedBy: userId,
  };

  const exceedWarnings = await checkPlanExceed({ projectId, event: draft });
  const conflicts = await checkSoftConflicts({
    organizationId: project.organizationId,
    event: draft,
  });

  if (exceedWarnings.length && !draft.exceedPlanAck) {
    return {
      requiresAck: true,
      type: 'exceed_plan',
      warnings: exceedWarnings,
      message: 'Lịch họp vượt MeetingPlan — cung cấp exceedPlanAck + overrideReason để tiếp tục',
    };
  }
  if (conflicts.length && !draft.conflictOverrideReason) {
    return {
      requiresAck: true,
      type: 'soft_conflict',
      conflicts,
      message: 'Trùng lịch — cung cấp conflictOverrideReason để override',
    };
  }

  const doc = await MeetingEvent.create(draft);
  await recordHistory({
    organizationId: project.organizationId,
    projectId,
    eventId: doc._id,
    action: 'created',
    actorUserId: userId,
    after: serializeEvent(doc),
  });
  if (exceedWarnings.length) {
    await recordHistory({
      organizationId: project.organizationId,
      projectId,
      eventId: doc._id,
      action: 'exceed_plan_ack',
      actorUserId: userId,
      reason: draft.overrideReason,
      after: { warnings: exceedWarnings },
    });
  }
  if (conflicts.length) {
    await recordHistory({
      organizationId: project.organizationId,
      projectId,
      eventId: doc._id,
      action: 'conflict_override',
      actorUserId: userId,
      reason: draft.conflictOverrideReason,
      after: { conflicts },
    });
  }
  return {
    event: serializeEvent(doc),
    warnings: exceedWarnings,
    conflicts,
  };
}

async function updateEvent({ userId, projectId, eventId, body = {} }) {
  await assertProject(projectId);
  await assertPerm(userId, projectId, 'meeting:create');
  const doc = await MeetingEvent.findOne({ _id: eventId, projectId });
  if (!doc) {
    const err = new Error('Meeting không tồn tại');
    err.statusCode = 404;
    throw err;
  }
  if (doc.status === 'completed') {
    const err = new Error('Không sửa cuộc họp đã hoàn thành');
    err.statusCode = 400;
    throw err;
  }
  const before = serializeEvent(doc);
  const sameSlot =
    body.startAt == null &&
    body.endAt == null &&
    body.participants == null;

  if (body.title != null) doc.title = String(body.title).trim().slice(0, 240);
  if (body.startAt) doc.startAt = new Date(body.startAt);
  if (body.endAt) doc.endAt = new Date(body.endAt);
  if (body.participants) doc.participants = sanitizeParticipants(body.participants);
  if (body.customerExchangeStatus) doc.customerExchangeStatus = body.customerExchangeStatus;
  if (body.status) doc.status = body.status;
  doc.updatedBy = userId;

  const action =
    body.startAt || body.endAt
      ? 'rescheduled'
      : body.participants
        ? 'participant_changed'
        : 'updated';

  // Reschedule same duration+attendees → effort unchanged (history still recorded)
  if (action === 'rescheduled') {
    const conflicts = await checkSoftConflicts({
      organizationId: doc.organizationId,
      event: doc,
      excludeEventId: doc._id,
    });
    if (conflicts.length && !body.conflictOverrideReason) {
      return {
        requiresAck: true,
        type: 'soft_conflict',
        conflicts,
        message: 'Trùng lịch ở thời điểm mới — cần conflictOverrideReason',
      };
    }
    if (body.conflictOverrideReason) {
      doc.conflictOverrideReason = String(body.conflictOverrideReason).slice(0, 500);
    }
    // Customer ack must be updated separately — reset awaiting if was confirmed
    if (doc.customerExchangeStatus === 'confirmed') {
      doc.customerExchangeStatus = 'awaiting';
    }
  }

  await doc.save();
  await recordHistory({
    organizationId: doc.organizationId,
    projectId,
    eventId: doc._id,
    action,
    actorUserId: userId,
    reason: body.reason || '',
    before,
    after: serializeEvent(doc),
  });
  return { event: serializeEvent(doc), effortUnchangedHint: sameSlot || action === 'rescheduled' };
}

/**
 * Cancel: disposition return_forecast (default) | no_longer_needed | replaced
 */
async function cancelEvent({ userId, projectId, eventId, body = {} }) {
  await assertProject(projectId);
  await assertPerm(userId, projectId, 'meeting:create');
  const doc = await MeetingEvent.findOne({ _id: eventId, projectId });
  if (!doc) {
    const err = new Error('Meeting không tồn tại');
    err.statusCode = 404;
    throw err;
  }
  if (doc.status === 'completed') {
    const err = new Error('Không hủy cuộc họp đã hoàn thành');
    err.statusCode = 400;
    throw err;
  }
  const disposition = body.disposition || 'return_forecast';
  if (disposition === 'no_longer_needed' && !String(body.reason || '').trim()) {
    const err = new Error('Hủy hết nhu cầu yêu cầu lý do');
    err.statusCode = 400;
    throw err;
  }
  const before = serializeEvent(doc);
  doc.status = 'cancelled';
  doc.cancelDisposition = disposition;
  if (body.replacementEventId) doc.replacementEventId = body.replacementEventId;
  doc.updatedBy = userId;
  await doc.save();

  // no_longer_needed: reduce future MeetingPlan hours for covered week (internal person-hours)
  if (disposition === 'no_longer_needed') {
    const weekKey = doc.planLineWeekKey || weekKeyFromDate(doc.startAt, { tzOffsetHours: 7 });
    const plan = await MeetingPlan.findOne({ projectId, status: { $in: ['draft', 'confirmed'] } }).sort({
      version: -1,
    });
    if (plan && weekKey) {
      for (const p of doc.participants || []) {
        if (p.isExternal || !p.userId) continue;
        const hours = participantPlannedHours({
          startAt: doc.startAt,
          endAt: doc.endAt,
          plannedDurationMinutes: p.plannedDurationMinutes,
        });
        for (const line of plan.lines || []) {
          if (line.weekKey !== weekKey) continue;
          if (line.userId && String(line.userId) !== String(p.userId)) continue;
          line.hours = Math.max(0, Number(line.hours) - hours);
        }
      }
      plan.updatedBy = userId;
      await plan.save();
    }
  }

  await recordHistory({
    organizationId: doc.organizationId,
    projectId,
    eventId: doc._id,
    action: 'cancelled',
    actorUserId: userId,
    reason: body.reason || disposition,
    before,
    after: serializeEvent(doc),
  });
  return { event: serializeEvent(doc), disposition };
}

async function completeEvent({ userId, projectId, eventId, body = {} }) {
  await assertProject(projectId);
  await assertPerm(userId, projectId, 'meeting:create');
  const doc = await MeetingEvent.findOne({ _id: eventId, projectId });
  if (!doc) {
    const err = new Error('Meeting không tồn tại');
    err.statusCode = 404;
    throw err;
  }
  const before = serializeEvent(doc);
  doc.status = 'completed';
  if (Array.isArray(body.participants)) {
    doc.participants = sanitizeParticipants(body.participants);
  }
  doc.updatedBy = userId;
  await doc.save();
  await recordHistory({
    organizationId: doc.organizationId,
    projectId,
    eventId: doc._id,
    action: 'completed',
    actorUserId: userId,
    reason: body.reason || '',
    before,
    after: serializeEvent(doc),
  });
  return { event: serializeEvent(doc) };
}

/**
 * G2 — expand recurrence rule into MeetingEvent instances (future only).
 */
async function expandRecurrence({ userId, projectId, ruleId }) {
  await assertProject(projectId);
  await assertPerm(userId, projectId, 'meeting:create');
  const rule = await MeetingRecurrenceRule.findOne({ _id: ruleId, projectId, active: true });
  if (!rule) {
    const err = new Error('Recurrence rule không tồn tại');
    err.statusCode = 404;
    throw err;
  }
  const created = [];
  const cursor = new Date(rule.rangeStart);
  const end = new Date(rule.rangeEnd);
  let guard = 0;
  while (cursor <= end && guard < 104) {
    if (cursor.getUTCDay() === rule.byWeekday) {
      const [hh, mm] = String(rule.startTimeLocal || '10:00').split(':').map(Number);
      const startAt = new Date(cursor);
      startAt.setUTCHours((hh || 10) - 7, mm || 0, 0, 0); // approx org +7 → UTC
      const endAt = new Date(startAt.getTime() + rule.durationMinutes * 60000);
      if (startAt >= new Date()) {
        const exists = await MeetingEvent.findOne({
          projectId,
          recurrenceRuleId: String(rule._id),
          startAt,
        }).lean();
        if (!exists) {
          const doc = await MeetingEvent.create({
            organizationId: rule.organizationId,
            projectId,
            title: rule.title,
            startAt,
            endAt,
            status: 'scheduled',
            source: 'recurrence',
            recurrenceRuleId: String(rule._id),
            planLineWeekKey: weekKeyFromDate(startAt, { tzOffsetHours: 7 }),
            participants: (rule.participantUserIds || []).map((uid) => ({
              userId: uid,
              isExternal: false,
              plannedDurationMinutes: rule.durationMinutes,
            })),
            createdBy: userId,
            updatedBy: userId,
          });
          created.push(serializeEvent(doc));
        }
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    guard += 1;
  }
  return { createdCount: created.length, events: created };
}

async function createRecurrenceRule({ userId, projectId, body = {} }) {
  const project = await assertProject(projectId);
  await assertPerm(userId, projectId, 'meeting:create');
  const rule = await MeetingRecurrenceRule.create({
    organizationId: project.organizationId,
    projectId,
    title: String(body.title || 'Recurring meeting').slice(0, 240),
    freq: 'weekly',
    byWeekday: Number(body.byWeekday),
    startTimeLocal: String(body.startTimeLocal || '10:00').slice(0, 8),
    durationMinutes: Math.max(15, Math.min(480, Number(body.durationMinutes) || 60)),
    rangeStart: new Date(body.rangeStart),
    rangeEnd: new Date(body.rangeEnd),
    participantUserIds: Array.isArray(body.participantUserIds) ? body.participantUserIds : [],
    createdBy: userId,
    updatedBy: userId,
  });
  const expanded = await expandRecurrence({ userId, projectId, ruleId: rule._id });
  return { rule: { id: String(rule._id), title: rule.title }, ...expanded };
}

module.exports = {
  listEvents,
  createEvent,
  updateEvent,
  cancelEvent,
  completeEvent,
  createRecurrenceRule,
  expandRecurrence,
  checkPlanExceed,
  checkSoftConflicts,
  serializeEvent,
};
