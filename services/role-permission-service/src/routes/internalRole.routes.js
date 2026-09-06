const express = require('express');
const router = express.Router();
const roleController = require('../controllers/role.controller');
const internalGatewayAuth = require('../middleware/internalGatewayAuth');

router.post(
  '/purge-by-server/:serverId',
  internalGatewayAuth,
  roleController.purgeByServerContext.bind(roleController)
);

router.post(
  '/backfill-role-read',
  internalGatewayAuth,
  roleController.backfillRoleRead.bind(roleController)
);

router.post(
  '/backfill-role-read/:serverId',
  internalGatewayAuth,
  roleController.backfillRoleRead.bind(roleController)
);

/** Org-service S2S — bulk UserRole theo server (admin list enrich). */
router.get(
  '/server/:serverId/assignments',
  internalGatewayAuth,
  roleController.listAssignmentsByServer.bind(roleController)
);

module.exports = router;
