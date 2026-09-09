const express = require('express');
const internalGatewayAuth = require('@enterprise/shared/middleware/internalGatewayAuth');
const router = express.Router();
const meetingController = require('../controllers/meeting.controller');
const { authenticate } = require('@enterprise/shared/middleware/auth');

router.delete(
  '/internal/purge-organization/:organizationId',
  internalGatewayAuth,
  meetingController.purgeOrganizationMeetings.bind(meetingController)
);

const meetingRecordingController = require('../controllers/meetingRecording.controller');
router.patch(
  '/internal/:meetingId/recording',
  internalGatewayAuth,
  meetingRecordingController.internalPatchRecording.bind(meetingRecordingController)
);

router.patch(
  '/internal/:meetingId/transcript-chunk',
  internalGatewayAuth,
  meetingRecordingController.internalPatchTranscriptChunk.bind(meetingRecordingController)
);

router.patch(
  '/internal/:meetingId/summary',
  internalGatewayAuth,
  meetingRecordingController.internalPatchSummary.bind(meetingRecordingController)
);

router.use(authenticate);

// Tạo meeting mới
router.post('/', meetingController.createMeeting.bind(meetingController));

// Lấy danh sách meetings
router.get('/', meetingController.getMeetings.bind(meetingController));

const meetingRecordingRoutes = require('./meetingRecording.routes');
router.use('/:meetingId/recording', meetingRecordingRoutes);

// Lấy meeting theo ID
router.get('/:meetingId', meetingController.getMeetingById.bind(meetingController));

// Bootstrap dữ liệu room cho WebRTC client
router.get('/:meetingId/bootstrap', meetingController.bootstrapMeetingRoom.bind(meetingController));

// Bắt đầu meeting
router.post('/:meetingId/start', meetingController.startMeeting.bind(meetingController));

// Kết thúc meeting
router.post('/:meetingId/end', meetingController.endMeeting.bind(meetingController));

// Thêm participant
router.post('/:meetingId/participants', meetingController.addParticipant.bind(meetingController));

// Xóa / kick participant
router.delete('/:meetingId/participants/:userId', meetingController.removeParticipant.bind(meetingController));

// Mute participant (host / org admin)
router.post('/:meetingId/participants/:userId/mute', meetingController.muteParticipant.bind(meetingController));

module.exports = router;



