const express = require('express');
const controller = require('../controllers/projectBrief.controller');

const router = express.Router();

router.post('/', controller.create.bind(controller));
router.get('/', controller.list.bind(controller));
router.get('/:briefId', controller.getOne.bind(controller));
router.post('/:briefId/accept', controller.accept.bind(controller));
router.post('/:briefId/cancel', controller.cancel.bind(controller));

module.exports = router;
