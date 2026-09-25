const express = require('express');
const controller = require('../controllers/requirement.controller');
const { requirementImportUpload } = require('../middleware/requirementImportUpload');
const { customerDocumentUpload } = require('../middleware/customerDocumentUpload');

const router = express.Router();

router.get('/import/template', controller.downloadTemplate);
router.post('/import/preview', requirementImportUpload.single('file'), controller.previewImport);
router.post('/import/confirm', controller.confirmImport);
router.post('/intake-draft', controller.createIntakeDraft);

router.get('/access', controller.getAccess);
router.get('/', controller.listPacks);
router.get('/:packId/source-file', controller.downloadSourceFile);
router.get('/:packId/customer-documents', controller.listPackCustomerDocuments);
router.post(
  '/:packId/customer-documents',
  customerDocumentUpload.single('file'),
  controller.uploadPackCustomerDocument
);
router.get('/:packId', controller.getPack);
router.post('/:packId/submit', controller.submitPack);
router.post('/:packId/approve', controller.approvePack);
router.post('/:packId/reject', controller.rejectPack);
router.delete('/:packId', controller.deletePack);
router.post('/:packId/create-project', controller.createProjectFromPack);
router.get('/:packId/ai-analysis', controller.getAiAnalysis);
router.post('/:packId/ai-analysis/snapshot', controller.createAiAnalysisSnapshot);
router.get('/:packId/ai-analysis/snapshot', controller.getAiAnalysisSnapshot);
router.post('/:packId/ai-analysis/run', controller.runAiAnalysis);
router.post('/:packId/ai-analysis/phase-run', controller.startPhaseAiPlanning);
router.post('/:packId/ai-analysis/confirm', controller.confirmAiAnalysis);
router.get('/:packId/ai-analysis/export-sheet11', controller.exportAiAnalysisSheet11);

module.exports = router;
