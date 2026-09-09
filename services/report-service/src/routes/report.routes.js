const express = require('express');
const { gatewayUserFromTrustedHeaders } = require('@enterprise/shared/middleware/gatewayTrust');
const controller = require('../controllers/report.controller');

const router = express.Router();

router.get('/dashboard/me', gatewayUserFromTrustedHeaders, controller.requireGatewayUser, controller.getMyDashboard);
router.get('/performance', gatewayUserFromTrustedHeaders, controller.requireGatewayUser, controller.listPerformance);
router.get(
  '/performance/users/:userId',
  gatewayUserFromTrustedHeaders,
  controller.requireGatewayUser,
  controller.getUserPerformanceReport
);
router.get(
  '/performance/estimate-hints',
  gatewayUserFromTrustedHeaders,
  controller.requireGatewayUser,
  controller.getEstimateHintsReport
);

module.exports = router;
