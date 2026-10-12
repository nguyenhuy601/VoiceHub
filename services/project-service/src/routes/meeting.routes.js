/**
 * Project-scoped MeetingPlan + MeetingEvent.
 * Mounted at /api/projects/:projectId/meetings-planning
 */
const express = require('express');
const meeting = require('../controllers/meeting.controller');

const router = express.Router({ mergeParams: true });

router.get('/plan', meeting.getMeetingPlan);
router.post('/plan/seed', meeting.seedMeetingPlan);
router.put('/plan', meeting.putMeetingPlan);
router.post('/plan/confirm', meeting.confirmMeetingPlan);
router.post('/plan/preview-end-date', meeting.previewEndDate);

router.get('/events', meeting.listMeetings);
router.post('/events', meeting.createMeeting);
router.patch('/events/:eventId', meeting.patchMeeting);
router.post('/events/:eventId/cancel', meeting.cancelMeeting);
router.post('/events/:eventId/complete', meeting.completeMeeting);
router.post('/recurrence', meeting.createRecurrence);

router.post('/workload', meeting.getWorkload);

module.exports = router;
