const express = require('express');
const router = express.Router();
const meetingController = require('../controllers/meeting.controller');

// Tạo meeting mới
router.post('/', meetingController.createMeeting.bind(meetingController));

// Lấy danh sách meetings
router.get('/', meetingController.getMeetings.bind(meetingController));

// Lấy meeting theo ID
router.get('/:meetingId', meetingController.getMeetingById.bind(meetingController));

// Bắt đầu meeting
router.post('/:meetingId/start', meetingController.startMeeting.bind(meetingController));

// Kết thúc meeting
router.post('/:meetingId/end', meetingController.endMeeting.bind(meetingController));

// Thêm participant
router.post('/:meetingId/participants', meetingController.addParticipant.bind(meetingController));

// Xóa participant
router.delete('/:meetingId/participants/:userId', meetingController.removeParticipant.bind(meetingController));

module.exports = router;



