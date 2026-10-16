const dmRosterService = require('../services/dmRoster.service');
const { sendServiceError } = require('../middleware/sendServiceError');
const { logger } = require('@enterprise/shared');

function actorId(req) {
  return String(req.user?.id || req.user?.userId || req.user?._id || '').trim();
}

async function getFriends(req, res) {
  try {
    const userId = actorId(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
    const data = await dmRosterService.listFriends(userId, { page, limit });
    return res.json({ success: true, data });
  } catch (error) {
    logger.error('[dmRoster] getFriends error:', error);
    return sendServiceError(res, 500, {
      errorCode: 'DM_ROSTER_LIST_FAILED',
      messageUser: 'Không tải được danh sách liên lạc.',
    });
  }
}

async function getRelationship(req, res) {
  try {
    const userId = actorId(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const peerId = String(req.params.friendId || req.params.peerId || '').trim();
    if (!peerId) {
      return res.status(400).json({
        success: false,
        message: 'friendId is required',
        errorCode: 'DM_ROSTER_PEER_REQUIRED',
      });
    }
    const data = await dmRosterService.getRelationship(userId, peerId);
    return res.json({ success: true, data });
  } catch (error) {
    logger.error('[dmRoster] getRelationship error:', error);
    return sendServiceError(res, 500, {
      errorCode: 'DM_ROSTER_RELATIONSHIP_FAILED',
      messageUser: 'Không kiểm tra được quan hệ DM.',
    });
  }
}

function goneGraph(req, res) {
  return res.status(410).json({
    success: false,
    message: 'Friend graph endpoints are removed. Use derived roster ACL.',
    errorCode: 'FRIEND_GRAPH_GONE',
  });
}

module.exports = {
  getFriends,
  getRelationship,
  goneGraph,
};
