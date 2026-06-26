const express = require('express');
const summaryController = require('../controllers/summary.controller');

const router = express.Router();

router.post('/', summaryController.createSummary.bind(summaryController));
router.get('/latest', summaryController.getLatestSummary.bind(summaryController));
router.get('/:id', summaryController.getSummaryById.bind(summaryController));

module.exports = router;
