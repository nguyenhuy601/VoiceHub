const express = require('express');
const meetingRecordingController = require('../controllers/meetingRecording.controller');

const router = express.Router({ mergeParams: true });

router.post(
  '/upload',
  meetingRecordingController.uploadMiddleware,
  meetingRecordingController.uploadRecording.bind(meetingRecordingController)
);

router.get('/stream', meetingRecordingController.streamRecording.bind(meetingRecordingController));

router.get('/', meetingRecordingController.getRecording.bind(meetingRecordingController));

module.exports = router;
