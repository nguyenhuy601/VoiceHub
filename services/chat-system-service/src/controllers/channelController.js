const Channel = require('../models/Channel');
const Message = require('../models/Message');

exports.getChannels = async (req, res, next) => {
  try {
    const { organizationId } = req.query;
    const channels = await Channel.find({ organization: organizationId });
    res.json({ status: 'success', data: channels });
  } catch (error) {
    next(error);
  }
};

exports.createChannel = async (req, res, next) => {
  try {
    const { name, description, type, organization, department, team, isPrivate } = req.body;

    const channel = await Channel.create({
      name,
      description,
      type,
      organization,
      department,
      team,
      isPrivate,
      createdBy: req.user._id,
    });

    res.status(201).json({ status: 'success', data: channel });
  } catch (error) {
    next(error);
  }
};

exports.getChannel = async (req, res, next) => {
  try {
    const channel = await Channel.findById(req.params.id);
    res.json({ status: 'success', data: channel });
  } catch (error) {
    next(error);
  }
};

exports.updateChannel = async (req, res, next) => {
  try {
    const { name, description } = req.body;
    const channel = await Channel.findByIdAndUpdate(
      req.params.id,
      { name, description },
      { new: true }
    );
    res.json({ status: 'success', data: channel });
  } catch (error) {
    next(error);
  }
};

exports.deleteChannel = async (req, res, next) => {
  try {
    await Channel.findByIdAndDelete(req.params.id);
    res.json({ status: 'success', message: 'Channel deleted' });
  } catch (error) {
    next(error);
  }
};

exports.getChannelMessages = async (req, res, next) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const messages = await Message.find({ channel: req.params.id })
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('sender', 'name avatar');

    res.json({ status: 'success', data: messages });
  } catch (error) {
    next(error);
  }
};
