const express = require('express');
const controller = require('../controllers/internalAiTask.controller');

const router = express.Router();

router.delete('/purge-organization/:organizationId', controller.purgeOrganization);

module.exports = router;
