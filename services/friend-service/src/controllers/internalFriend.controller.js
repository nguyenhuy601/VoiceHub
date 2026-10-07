const friendService = require('../services/friend.service');
const { logger } = require('@enterprise/shared');
const { sendServiceError } = require('../middleware/sendServiceError');

async function ensureAccepted(req, res) {
  try {
    const userId = String(req.body?.userId || '').trim();
    const peerUserIds = Array.isArray(req.body?.peerUserIds) ? req.body.peerUserIds : [];
    const source = String(req.body?.source || 'system').trim() || 'system';

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'userId is required',
        errorCode: 'FRIEND_ENSURE_USER_REQUIRED',
      });
    }

    const data = await friendService.ensureAcceptedWithPeers(userId, peerUserIds, { source });
    return res.json({ success: true, data });
  } catch (error) {
    logger.error('internal ensure-accepted error:', error);
    return sendServiceError(res, 500, { errorCode: 'FRIEND_ENSURE_FAILED' });
  }
}

module.exports = {
  ensureAccepted,
};
