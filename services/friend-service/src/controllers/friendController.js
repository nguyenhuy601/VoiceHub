const Friendship = require('../models/Friendship');
const axios = require('axios');
const friendService = require('../services/friend.service');

const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://user-service:3004';

exports.getFriends = async (req, res, next) => {
  try {
    const friends = await Friendship.find({
      $or: [
        { requester: req.user._id, status: 'accepted' },
        { recipient: req.user._id, status: 'accepted' },
      ],
    })
      .populate('requester', 'name avatar email')
      .populate('recipient', 'name avatar email');

    const formatted = friends.map((f) => {
      const friend = f.requester._id.toString() === req.user._id.toString() 
        ? f.recipient 
        : f.requester;
      return { ...friend.toObject(), friendshipId: f._id };
    });

    res.json({ status: 'success', data: formatted });
  } catch (error) {
    next(error);
  }
};

exports.getPendingRequests = async (req, res, next) => {
  try {
    const requests = await Friendship.find({
      recipient: req.user._id,
      status: 'pending',
    }).populate('requester', 'name avatar email');

    res.json({ status: 'success', data: requests });
  } catch (error) {
    next(error);
  }
};

exports.sendFriendRequest = async (req, res, next) => {
  try {
    const { userId } = req.body;

    if (userId === req.user._id.toString()) {
      return res.status(400).json({ status: 'fail', message: 'Cannot add yourself' });
    }

    const existing = await Friendship.findOne({
      $or: [
        { requester: req.user._id, recipient: userId },
        { requester: userId, recipient: req.user._id },
      ],
    });

    if (existing) {
      return res.status(400).json({ status: 'fail', message: 'Request already exists' });
    }

    const friendship = await Friendship.create({
      requester: req.user._id,
      recipient: userId,
    });

    res.status(201).json({ status: 'success', data: friendship });
  } catch (error) {
    next(error);
  }
};

exports.acceptRequest = async (req, res, next) => {
  try {
    const friendship = await Friendship.findByIdAndUpdate(
      req.params.id,
      { status: 'accepted' },
      { new: true }
    );

    res.json({ status: 'success', data: friendship });
  } catch (error) {
    next(error);
  }
};

exports.rejectRequest = async (req, res, next) => {
  try {
    await Friendship.findByIdAndUpdate(req.params.id, { status: 'rejected' });
    res.json({ status: 'success', message: 'Request rejected' });
  } catch (error) {
    next(error);
  }
};

exports.removeFriend = async (req, res, next) => {
  try {
    await Friendship.findByIdAndDelete(req.params.id);
    res.json({ status: 'success', message: 'Friend removed' });
  } catch (error) {
    next(error);
  }
};

exports.blockUser = async (req, res, next) => {
  try {
    const { userId } = req.body;

    await Friendship.findOneAndUpdate(
      {
        $or: [
          { requester: req.user._id, recipient: userId },
          { requester: userId, recipient: req.user._id },
        ],
      },
      { status: 'blocked', requester: req.user._id },
      { upsert: true }
    );

    res.json({ status: 'success', message: 'User blocked' });
  } catch (error) {
    next(error);
  }
};

exports.unblockUser = async (req, res, next) => {
  try {
    await Friendship.findOneAndDelete({
      requester: req.user._id,
      recipient: req.params.userId,
      status: 'blocked',
    });

    res.json({ status: 'success', message: 'User unblocked' });
  } catch (error) {
    next(error);
  }
};

// Search for a user by phone number via user service
// also include current relationship status if found
exports.searchByPhone = async (req, res, next) => {
  try {
    const { phone } = req.query;
    if (!phone) {
      return res.status(400).json({ status: 'fail', message: 'Phone parameter is required' });
    }

    const response = await axios.get(`${USER_SERVICE_URL}/api/users/phone/${encodeURIComponent(phone)}`);
    const userData = response.data?.data;
    if (!userData) {
      return res.status(404).json({ status: 'fail', message: 'Không tìm thấy người dùng' });
    }

    // Chuẩn hóa ID (user-service có thể trả userId/_id dạng string hoặc object)
    const toId = (v) => (v == null ? null : (v && typeof v === 'object' && v.$oid ? v.$oid : String(v)));
    const targetUserId = toId(userData.userId ?? userData._id) || null;
    const currentUserId = toId(req.user._id ?? req.user.id) || null;

    let relationship = { status: 'none' };
    if (currentUserId && targetUserId) {
      try {
        relationship = await friendService.getRelationship(currentUserId, targetUserId);
      } catch (relErr) {
        console.error('[friendController.searchByPhone] getRelationship error:', relErr);
        relationship = { status: 'none' };
      }
    }

    res.json({
      status: 'success',
      data: {
        ...userData,
        relationship,
      },
    });
  } catch (error) {
    // propagate error from remote service or network issue
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data || {};
      // 404 từ user-service: trả message tiếng Việt thống nhất
      if (status === 404) {
        return res.status(404).json({ status: 'fail', message: 'Không tìm thấy người dùng' });
      }
      return res.status(status).json(data);
    }
    next(error);
  }
};
