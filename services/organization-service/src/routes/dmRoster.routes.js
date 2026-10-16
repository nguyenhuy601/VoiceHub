const express = require('express');
const { protect } = require('../middleware/auth');
const {
  getFriends,
  getRelationship,
  goneGraph,
} = require('../controllers/dmRoster.controller');

const router = express.Router();

router.use(protect);

/** Legacy friend graph — gone (RULE-03). */
router.get('/search', goneGraph);
router.get('/pending', goneGraph);
router.post('/request', goneGraph);
router.post('/:friendId/accept', goneGraph);
router.post('/:friendId/reject', goneGraph);
router.post('/:friendId/block', goneGraph);
router.post('/:friendId/unblock', goneGraph);

router.get('/', getFriends);
router.get('/:friendId/relationship', getRelationship);

module.exports = router;
