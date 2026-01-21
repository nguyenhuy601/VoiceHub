const Friendship = require('../models/Friendship');

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
