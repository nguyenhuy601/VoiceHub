const planSvc = require('../services/meetingPlan.service');
const eventSvc = require('../services/meetingEvent.service');
const { aggregateWorkloadRows } = require('../engines/allocation');
const governanceService = require('../services/governance.service');
const { sendServiceError, sendErrorFromCatch } = require('../middleware/sendServiceError');

function asUserId(req) {
  return req.user?.id || req.userContext?.userId || '';
}

function projectIdOf(req) {
  return String(req.params.projectId || '').trim();
}

async function getMeetingPlan(req, res) {
  try {
    const data = await planSvc.getActivePlan({
      userId: asUserId(req),
      projectId: projectIdOf(req),
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, err.message, 'MEETING_PLAN_GET_FAILED');
  }
}

async function seedMeetingPlan(req, res) {
  try {
    const data = await planSvc.seedFromOrgConfig({
      userId: asUserId(req),
      projectId: projectIdOf(req),
      body: req.body || {},
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, err.message, 'MEETING_PLAN_SEED_FAILED');
  }
}

async function putMeetingPlan(req, res) {
  try {
    const data = await planSvc.upsertPlan({
      userId: asUserId(req),
      projectId: projectIdOf(req),
      body: req.body || {},
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, err.message, 'MEETING_PLAN_PUT_FAILED');
  }
}

async function confirmMeetingPlan(req, res) {
  try {
    const data = await planSvc.confirmPlan({
      userId: asUserId(req),
      projectId: projectIdOf(req),
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, err.message, 'MEETING_PLAN_CONFIRM_FAILED');
  }
}

async function previewEndDate(req, res) {
  try {
    const plan = await planSvc.getActivePlan({
      userId: asUserId(req),
      projectId: projectIdOf(req),
    });
    const preview = planSvc.previewEndDatePlanAdjust({
      lines: plan?.lines || [],
      newEndDate: req.body?.endDate || req.query.endDate,
    });
    return res.json({ success: true, data: preview });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, err.message, 'MEETING_PLAN_PREVIEW_FAILED');
  }
}

async function listMeetings(req, res) {
  try {
    const data = await eventSvc.listEvents({
      userId: asUserId(req),
      projectId: projectIdOf(req),
      view: req.query.view === 'full' ? 'full' : 'summary',
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, err.message, 'MEETING_LIST_FAILED');
  }
}

async function createMeeting(req, res) {
  try {
    const data = await eventSvc.createEvent({
      userId: asUserId(req),
      projectId: projectIdOf(req),
      body: req.body || {},
    });
    if (data.requiresAck) {
      return res.status(409).json({ success: false, data });
    }
    return res.status(201).json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, err.message, 'MEETING_CREATE_FAILED');
  }
}

async function patchMeeting(req, res) {
  try {
    const data = await eventSvc.updateEvent({
      userId: asUserId(req),
      projectId: projectIdOf(req),
      eventId: req.params.eventId,
      body: req.body || {},
    });
    if (data.requiresAck) {
      return res.status(409).json({ success: false, data });
    }
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, err.message, 'MEETING_UPDATE_FAILED');
  }
}

async function cancelMeeting(req, res) {
  try {
    const data = await eventSvc.cancelEvent({
      userId: asUserId(req),
      projectId: projectIdOf(req),
      eventId: req.params.eventId,
      body: req.body || {},
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, err.message, 'MEETING_CANCEL_FAILED');
  }
}

async function completeMeeting(req, res) {
  try {
    const data = await eventSvc.completeEvent({
      userId: asUserId(req),
      projectId: projectIdOf(req),
      eventId: req.params.eventId,
      body: req.body || {},
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, err.message, 'MEETING_COMPLETE_FAILED');
  }
}

async function createRecurrence(req, res) {
  try {
    const data = await eventSvc.createRecurrenceRule({
      userId: asUserId(req),
      projectId: projectIdOf(req),
      body: req.body || {},
    });
    return res.status(201).json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, err.message, 'MEETING_RECURRENCE_FAILED');
  }
}

/** Workload % for project members (meeting + optional taskHours map) — commitment separate. */
async function getWorkload(req, res) {
  try {
    const projectId = projectIdOf(req);
    const plan = await planSvc.getActivePlan({
      userId: asUserId(req),
      projectId,
    });
    const events = await eventSvc.listEvents({
      userId: asUserId(req),
      projectId,
    });
    const Project = require('../models/Project');
    const project = await Project.findById(projectId).lean();
    const calPack = await governanceService.fetchOrgWorkingCalendar(project.organizationId);
    const taskHoursByUserWeek =
      req.body?.taskHoursByUserWeek && typeof req.body.taskHoursByUserWeek === 'object'
        ? req.body.taskHoursByUserWeek
        : {};
    const { rows, meetingDetail } = aggregateWorkloadRows({
      planLines: plan?.lines || [],
      events: events.map((e) => ({
        ...e,
        participants: e.participants,
      })),
      taskHoursByUserWeek,
      calendar: calPack.workingCalendar,
      holidays: calPack.holidays,
    });
    return res.json({
      success: true,
      data: {
        workloadRows: rows,
        meetingDetail,
        commitmentNote:
          'commitmentPct comes from ProjectMember.allocations — not modified by meetings',
        capacityBasis: { ptoExcluded: true },
      },
    });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, err.message, 'MEETING_WORKLOAD_FAILED');
  }
}

module.exports = {
  getMeetingPlan,
  seedMeetingPlan,
  putMeetingPlan,
  confirmMeetingPlan,
  previewEndDate,
  listMeetings,
  createMeeting,
  patchMeeting,
  cancelMeeting,
  completeMeeting,
  createRecurrence,
  getWorkload,
};
