const express = require('express');
const controller = require('../controllers/requirement.controller');
const { requirementImportUpload } = require('../middleware/requirementImportUpload');
const { customerDocumentUpload } = require('../middleware/customerDocumentUpload');

const router = express.Router();

router.get('/import/template', controller.downloadTemplate);
router.post('/import/preview', requirementImportUpload.single('file'), controller.previewImport);
router.post('/import/confirm', controller.confirmImport);
router.post('/intake-draft', controller.createIntakeDraft);
router.post(
  '/:packId/customer-documents',
  customerDocumentUpload.single('file'),
  controller.uploadPackCustomerDocumentCtrl
);

router.get('/access', controller.getAccess);
router.get('/', controller.listPacks);
router.get('/:packId/source-file', controller.downloadSourceFile);
/** AI Analysis Blueprint — trước /:packId để không bị nuốt path */
router.get('/:packId/ai-analysis/export', controller.exportAiAnalysis);
router.post('/:packId/ai-analysis/phase-run', controller.startPhaseAiPlanning);
router.get('/:packId/ai-analysis', controller.getAiAnalysis);
router.post('/:packId/ai-analysis/jobs/:jobId/run', controller.runAiAnalysis);
router.post('/:packId/ai-analysis/jobs/:jobId/confirm', controller.confirmAiAnalysis);
/** Gate2 — confirm phase_how without job id (FE: POST …/ai-analysis/confirm { phase: 'how' }). */
router.post('/:packId/ai-analysis/confirm', controller.confirmAiAnalysisPhase);
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
