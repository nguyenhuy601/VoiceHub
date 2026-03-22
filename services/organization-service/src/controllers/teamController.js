const Channel = require('../models/Channel');

const buildScope = (req) => ({
  organization: req.params.orgId,
  department: req.params.deptId,
  isActive: true,
});

exports.getTeams = async (req, res, next) => {
  try {
    const channels = await Channel.find(buildScope(req));

    res.json({ status: 'success', data: channels });
  } catch (error) {
    next(error);
  }
};

exports.createTeam = async (req, res, next) => {
  try {
    const { name, description, leader, type } = req.body;

    const channel = await Channel.create({
      name,
      description,
      type: type || 'chat',
      ...buildScope(req),
      leader,
    });

    res.status(201).json({ status: 'success', data: channel });
  } catch (error) {
    next(error);
  }
};

exports.updateTeam = async (req, res, next) => {
  try {
    const { name, description, leader, type } = req.body;

    const channel = await Channel.findOneAndUpdate(
      { _id: req.params.id, ...buildScope(req) },
      { name, description, leader, type },
      { new: true }
    );

    res.json({ status: 'success', data: channel });
  } catch (error) {
    next(error);
  }
};

exports.deleteTeam = async (req, res, next) => {
  try {
    await Channel.findOneAndUpdate(
      { _id: req.params.id, ...buildScope(req) },
      { isActive: false },
      { new: true }
    );
    res.json({ status: 'success', message: 'Channel deleted' });
  } catch (error) {
    next(error);
  }
};

exports.getChannels = exports.getTeams;
exports.createChannel = exports.createTeam;
exports.updateChannel = exports.updateTeam;
exports.deleteChannel = exports.deleteTeam;
