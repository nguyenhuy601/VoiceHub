const Department = require('../models/Department');
const Membership = require('../models/Membership');

exports.getDepartments = async (req, res, next) => {
  try {
    const departments = await Department.find({ organization: req.params.orgId })
      .populate('head', 'name email');

    res.json({ status: 'success', data: departments });
  } catch (error) {
    next(error);
  }
};

exports.createDepartment = async (req, res, next) => {
  try {
    const { name, description, head } = req.body;

    const department = await Department.create({
      name,
      description,
      organization: req.params.orgId,
      head,
    });

    res.status(201).json({ status: 'success', data: department });
  } catch (error) {
    next(error);
  }
};

exports.updateDepartment = async (req, res, next) => {
  try {
    const { name, description, head } = req.body;

    const department = await Department.findByIdAndUpdate(
      req.params.id,
      { name, description, head },
      { new: true }
    );

    res.json({ status: 'success', data: department });
  } catch (error) {
    next(error);
  }
};

exports.deleteDepartment = async (req, res, next) => {
  try {
    await Department.findByIdAndDelete(req.params.id);
    res.json({ status: 'success', message: 'Department deleted' });
  } catch (error) {
    next(error);
  }
};
