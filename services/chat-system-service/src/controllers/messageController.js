const Message = require('../models/Message');

exports.sendMessage = async (req, res, next) => {
  try {
    const { content, channel, attachments, replyTo } = req.body;

    const message = await Message.create({
      content,
      channel,
      sender: req.user._id,
      attachments,
      replyTo,
    });

    const populatedMessage = await Message.findById(message._id).populate('sender', 'name avatar');

    // Emit via Socket.IO (handled in socket handler)
    res.status(201).json({ status: 'success', data: populatedMessage });
  } catch (error) {
    next(error);
  }
};

exports.editMessage = async (req, res, next) => {
  try {
    const { content } = req.body;

    const message = await Message.findOneAndUpdate(
      { _id: req.params.id, sender: req.user._id },
      { content, isEdited: true },
      { new: true }
    );

    res.json({ status: 'success', data: message });
  } catch (error) {
    next(error);
  }
};

exports.deleteMessage = async (req, res, next) => {
  try {
    await Message.findOneAndUpdate(
      { _id: req.params.id, sender: req.user._id },
      { isDeleted: true }
    );

    res.json({ status: 'success', message: 'Message deleted' });
  } catch (error) {
    next(error);
  }
};

exports.addReaction = async (req, res, next) => {
  try {
    const { emoji } = req.body;

    const message = await Message.findById(req.params.id);
    message.reactions.push({ emoji, user: req.user._id });
    await message.save();

    res.json({ status: 'success', data: message });
  } catch (error) {
    next(error);
  }
};
