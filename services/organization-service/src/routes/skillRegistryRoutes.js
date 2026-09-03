const express = require('express');
const { protect, authorizeGrant } = require('../middleware/auth');
const skillRegistryController = require('../controllers/skillRegistry.controller');

const router = express.Router({ mergeParams: true });

router.use(protect);

router.get('/', skillRegistryController.listSkills);
router.get('/:skillId', skillRegistryController.getSkill);
router.patch('/:skillId/review', authorizeGrant('organization.skill_registry.review'), skillRegistryController.reviewSkill);

module.exports = router;
