const Membership = require('../models/Membership');

exports.getMembers = async (req, res, next) => {
  try {
    const members = await Membership.find({ organization: req.params.orgId })
      .populate('user', 'name email avatar')
      .populate('department', 'name')
      .populate('team', 'name');

    res.json({ status: 'success', data: members });
  } catch (error) {
    next(error);
  }
};

exports.inviteMember = async (req, res, next) => {
  try {
    const { email, role } = req.body;

    // TODO: Send invitation email
    // For now, just create pending membership

    res.json({ status: 'success', message: 'Invitation sent' });
  } catch (error) {
    next(error);
  }
};

exports.updateMemberRole = async (req, res, next) => {
  try {
    const { role, department, team } = req.body;

    const membership = await Membership.findOneAndUpdate(
      { user: req.params.userId, organization: req.params.orgId },
      { role, department, team },
      { new: true }
    );

    res.json({ status: 'success', data: membership });
  } catch (error) {
    next(error);
  }
};

exports.removeMember = async (req, res, next) => {
  try {
    await Membership.findOneAndDelete({
      user: req.params.userId,
      organization: req.params.orgId,
    });

    res.json({ status: 'success', message: 'Member removed' });
  } catch (error) {
    next(error);
  }
};
