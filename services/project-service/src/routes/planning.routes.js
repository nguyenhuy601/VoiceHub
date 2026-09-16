/**
 * Project-scoped Phase 1 delivery planning artifact routes.
 * Mounted at /api/projects/:projectId/planning
 * (Separate from hub planning-items controller.)
 */
const express = require('express');
const deliveryPlanning = require('../controllers/deliveryPlanning.controller');

const router = express.Router({ mergeParams: true });

router.get('/artifacts', deliveryPlanning.listArtifacts);
router.post('/artifacts', deliveryPlanning.createArtifact);
router.get('/artifacts/:artifactId', deliveryPlanning.getArtifact);
router.patch('/artifacts/:artifactId', deliveryPlanning.updateArtifact);
router.post('/artifacts/:artifactId/transition', deliveryPlanning.transitionArtifact);

router.get('/baselines', deliveryPlanning.listBaselines);
router.post('/baselines', deliveryPlanning.cutBaseline);

router.get('/summary', deliveryPlanning.getSummary);
router.post('/suggest', deliveryPlanning.suggest);
router.post('/publish-wbs', deliveryPlanning.publishWbs);

module.exports = router;
