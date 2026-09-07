const express = require('express');
const controller = require('../controllers/report.controller');

const router = express.Router();

router.get('/dashboard/:userId', controller.getInternalDashboard);
router.put('/dashboard/:userId', controller.putInternalDashboard);
router.put('/performance/users/:userId', controller.putInternalPerformance);

module.exports = router;
