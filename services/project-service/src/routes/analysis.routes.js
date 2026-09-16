/**
 * Project-scoped analysis / requirements governance routes.
 * Mounted at /api/projects/:projectId/...
 */
const express = require('express');
const analysis = require('../controllers/analysis.controller');
const { requirementImportUpload } = require('../middleware/requirementImportUpload');

const router = express.Router({ mergeParams: true });

router.get('/customer-documents', analysis.listCustomerDocuments);
router.post('/customer-documents', analysis.createCustomerDocument);

router.get('/analysis-import-sets', analysis.listImportSets);
router.post(
  '/analysis-import-sets/raw',
  requirementImportUpload.single('file'),
  analysis.attachRawImportSet
);
router.post('/analysis-import-sets/:setId/trash', analysis.trashImportSet);
router.post('/analysis-import-sets/:setId/restore', analysis.restoreImportSet);

router.get('/analysis-artifacts', analysis.listArtifacts);
router.post('/analysis-artifacts', analysis.createArtifact);
router.get('/analysis-artifacts/:artifactId', analysis.getArtifact);
router.patch('/analysis-artifacts/:artifactId', analysis.updateArtifact);
router.post('/analysis-artifacts/:artifactId/transition', analysis.transitionArtifact);

router.get('/analysis-trace-links', analysis.listTraceLinks);
router.post('/analysis-trace-links', analysis.createTraceLink);
router.get('/analysis-gaps', analysis.getGapReport);

router.get('/srs-baselines', analysis.listSrsBaselines);
router.post('/srs-baselines', analysis.cutSrsBaseline);
router.get('/srs-draft', analysis.getSrsDraft);
router.post('/phase2/advance', analysis.advancePhase2);
router.post('/phase1/start-planning', analysis.startDeliveryPlanning);
router.post('/analysis-import/confirm', analysis.confirmAnalysisImport);

module.exports = router;
