const express = require('express');

const router = express.Router();

/**
 * S2S no-op — keep chat lazy-heal from 5xx after graph removal.
 * POST /api/friends/internal/ensure-accepted
 */
router.post('/ensure-accepted', (req, res) => {
  return res.status(200).json({ success: true, data: { noop: true } });
});

module.exports = router;
