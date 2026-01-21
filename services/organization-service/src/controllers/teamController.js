const Team = require('../models/Team');

exports.getTeams = async (req, res, next) => {
  try {
    const teams = await Team.find({
      organization: req.params.orgId,
      department: req.params.deptId,
    }).populate('leader', 'name email');

    res.json({ status: 'success', data: teams });
  } catch (error) {
    next(error);
  }
};

exports.createTeam = async (req, res, next) => {
  try {
    const { name, description, leader } = req.body;

    const team = await Team.create({
      name,
      description,
      organization: req.params.orgId,
      department: req.params.deptId,
      leader,
    });

    res.status(201).json({ status: 'success', data: team });
  } catch (error) {
    next(error);
  }
};

exports.updateTeam = async (req, res, next) => {
  try {
    const { name, description, leader } = req.body;

    const team = await Team.findByIdAndUpdate(
      req.params.id,
      { name, description, leader },
      { new: true }
    );

    res.json({ status: 'success', data: team });
  } catch (error) {
    next(error);
  }
};

exports.deleteTeam = async (req, res, next) => {
  try {
    await Team.findByIdAndDelete(req.params.id);
    res.json({ status: 'success', message: 'Team deleted' });
  } catch (error) {
    next(error);
  }
};
