const express = require('express');
const router = express.Router();
const roleController = require('../controllers/role.controller');

router.post('/purge-by-server/:serverId', roleController.purgeByServerContext.bind(roleController));

module.exports = router;
