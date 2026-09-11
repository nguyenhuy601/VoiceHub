/**
 * Project-scoped analysis / requirements governance routes.
 * Mounted at /api/projects/:projectId/...
 */
const express = require('express');
const analysis = require('../controllers/analysis.controller');

const router = express.Router({ mergeParams: true });

router.get('/customer-documents', analysis.listCustomerDocuments);
router.post('/customer-documents', analysis.createCustomerDocument);

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
router.post('/phase2/advance', analysis.advancePhase2);

module.exports = router;
