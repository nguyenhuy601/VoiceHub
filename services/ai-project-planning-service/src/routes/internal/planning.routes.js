const express = require('express');
const controller = require('../../controllers/internalPlanning.controller');

const router = express.Router();

router.post('/runs', controller.startRun);
router.get('/runs/:runId', controller.getRun);
router.post('/runs/:runId/cancel', controller.cancelRun);
router.post('/runs/:runId/resume', controller.resumeRun);
router.post('/runs/:runId/feedback', controller.submitFeedback);

module.exports = router;
