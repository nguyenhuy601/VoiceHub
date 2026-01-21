const Organization = require('../models/Organization');
const Membership = require('../models/Membership');

exports.getMyOrganizations = async (req, res, next) => {
  try {
    const memberships = await Membership.find({ user: req.user.id })
      .populate('organization')
      .select('organization role');

    const organizations = memberships.map(m => ({
      ...m.organization.toObject(),
      myRole: m.role,
    }));

    res.json({ status: 'success', data: organizations });
  } catch (error) {
    next(error);
  }
};

exports.createOrganization = async (req, res, next) => {
  try {
    const { name, description, logo } = req.body;

    const organization = await Organization.create({
      name,
      description,
      logo,
      owner: req.user.id,
    });

    // Auto-add creator as org_admin
    await Membership.create({
      user: req.user.id,
      organization: organization._id,
      role: 'org_admin',
      status: 'active',
    });

    res.status(201).json({ status: 'success', data: organization });
  } catch (error) {
    next(error);
  }
};

exports.getOrganization = async (req, res, next) => {
  try {
    const organization = await Organization.findById(req.params.id);
    if (!organization) {
      return res.status(404).json({ status: 'fail', message: 'Organization not found' });
    }

    // Check membership
    const membership = await Membership.findOne({
      user: req.user.id,
      organization: organization._id,
    });

    if (!membership) {
      return res.status(403).json({ status: 'fail', message: 'Access denied' });
    }

    res.json({ status: 'success', data: { ...organization.toObject(), myRole: membership.role } });
  } catch (error) {
    next(error);
  }
};

exports.updateOrganization = async (req, res, next) => {
  try {
    const { name, description, logo, settings } = req.body;

    const organization = await Organization.findByIdAndUpdate(
      req.params.id,
      { name, description, logo, settings },
      { new: true, runValidators: true }
    );

    res.json({ status: 'success', data: organization });
  } catch (error) {
    next(error);
  }
};

exports.deleteOrganization = async (req, res, next) => {
  try {
    await Organization.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ status: 'success', message: 'Organization deactivated' });
  } catch (error) {
    next(error);
  }
};
