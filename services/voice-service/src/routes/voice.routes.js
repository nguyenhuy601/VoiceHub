const express = require('express');
const router = express.Router();
const meetingController = require('../controllers/meeting.controller');
const { authenticate } = require('@enterprise/shared/middleware/auth');

router.use(authenticate);

const callRoutes = require('./call.routes');
router.use(callRoutes);

router.get('/rooms/:roomId/bootstrap', meetingController.bootstrapRoom.bind(meetingController));

const voiceRoomRoutes = require('./voiceRoom.routes');
router.use('/rooms/:roomId', voiceRoomRoutes);

module.exports = router;
