const express = require('express');
const controller = require('../controllers/requirement.controller');
const { requirementImportUpload } = require('../middleware/requirementImportUpload');

const router = express.Router();

router.get('/import/template', controller.downloadTemplate);
router.post('/import/preview', requirementImportUpload.single('file'), controller.previewImport);
router.post('/import/confirm', controller.confirmImport);

router.get('/access', controller.getAccess);
router.get('/', controller.listPacks);
router.get('/:packId/source-file', controller.downloadSourceFile);
router.get('/:packId', controller.getPack);
router.post('/:packId/submit', controller.submitPack);
router.post('/:packId/approve', controller.approvePack);
router.post('/:packId/reject', controller.rejectPack);
router.post('/:packId/create-project', controller.createProjectFromPack);
router.post('/:packId/ai-planning/run', controller.runAiPlanning);

module.exports = router;
