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
/** AI Analysis Blueprint — trước /:packId để không bị nuốt path */
router.get('/:packId/ai-analysis/export', controller.exportAiAnalysis);
router.get('/:packId/ai-analysis', controller.getAiAnalysis);
router.post('/:packId/ai-analysis/jobs/:jobId/run', controller.runAiAnalysis);
router.post('/:packId/ai-analysis/jobs/:jobId/confirm', controller.confirmAiAnalysis);
router.get('/:packId', controller.getPack);
router.post('/:packId/submit', controller.submitPack);
router.post('/:packId/approve', controller.approvePack);
router.post('/:packId/reject', controller.rejectPack);
router.delete('/:packId', controller.deletePack);
router.post('/:packId/create-project', controller.createProjectFromPack);
router.post('/:packId/ai-planning/run', controller.runAiPlanning);
router.post('/:packId/ai-planning/approve-staffing', controller.approveAiStaffing);
router.post('/:packId/ai-planning/discard-staffing', controller.discardAiStaffing);

module.exports = router;
