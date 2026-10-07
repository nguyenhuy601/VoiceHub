const express = require('express');
const controller = require('../controllers/aiTask.controller');
const { bindObjectIdParams } = require('../utils/bindObjectIdParam');

const router = express.Router();

bindObjectIdParams(router, ['id', 'taskId', 'boardId', 'listId']);

router.post('/extract', controller.postExtract);
router.get('/extractions/:id', controller.getExtraction);
router.post('/confirm', controller.postConfirm);
router.get('/:taskId/sync-suggestions', controller.listSyncSuggestions);
router.post('/:taskId/sync-suggestions/:id/approve', controller.approveSyncSuggestion);
router.post('/project-draft', controller.postProjectDraft);
router.get('/project-drafts/:id', controller.getProjectDraft);
router.post('/project-drafts/:id/confirm', controller.confirmProjectDraft);
router.post('/boards/:boardId/lists/:listId/suggest-cards', controller.suggestCards);
router.post('/team-assign-drafts/:id/confirm', controller.confirmTeamAssignDraft);

module.exports = router;
