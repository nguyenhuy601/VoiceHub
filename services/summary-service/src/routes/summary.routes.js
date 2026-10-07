const express = require('express');
const summaryController = require('../controllers/summary.controller');
const { isObjectIdString } = require('../utils/summaryInput');
const { SummaryError } = require('../utils/summaryErrors');

const router = express.Router();

router.param('id', (req, res, next, id) => {
  if (!isObjectIdString(id)) return next(new SummaryError('SUMMARY_BAD_REQUEST'));
  return next();
});

router.post('/', summaryController.createSummary);
router.get('/latest', summaryController.getLatestSummary);
router.get('/:id', summaryController.getSummaryById);

module.exports = router;
