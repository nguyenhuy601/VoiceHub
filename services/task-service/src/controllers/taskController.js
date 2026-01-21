const Task = require('../models/Task');

exports.getTasks = async (req, res, next) => {
  try {
    const { organizationId, status, assignedTo } = req.query;
    const filter = { organization: organizationId };

    if (status) filter.status = status;
    if (assignedTo) filter.assignedTo = assignedTo;

    const tasks = await Task.find(filter)
      .populate('assignedTo', 'name avatar')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 });

    res.json({ status: 'success', data: tasks });
  } catch (error) {
    next(error);
  }
};

exports.createTask = async (req, res, next) => {
  try {
    const taskData = {
      ...req.body,
      createdBy: req.user._id,
    };

    const task = await Task.create(taskData);
    res.status(201).json({ status: 'success', data: task });
  } catch (error) {
    next(error);
  }
};

exports.getTask = async (req, res, next) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate('assignedTo', 'name avatar')
      .populate('createdBy', 'name');

    res.json({ status: 'success', data: task });
  } catch (error) {
    next(error);
  }
};

exports.updateTask = async (req, res, next) => {
  try {
    const task = await Task.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    res.json({ status: 'success', data: task });
  } catch (error) {
    next(error);
  }
};

exports.deleteTask = async (req, res, next) => {
  try {
    await Task.findByIdAndDelete(req.params.id);
    res.json({ status: 'success', message: 'Task deleted' });
  } catch (error) {
    next(error);
  }
};

exports.updateStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const update = { status };

    if (status === 'done') {
      update.completedAt = new Date();
    }

    const task = await Task.findByIdAndUpdate(req.params.id, update, { new: true });
    res.json({ status: 'success', data: task });
  } catch (error) {
    next(error);
  }
};

exports.assignTask = async (req, res, next) => {
  try {
    const { userId } = req.body;
    const task = await Task.findById(req.params.id);

    if (!task.assignedTo.includes(userId)) {
      task.assignedTo.push(userId);
      await task.save();
    }

    res.json({ status: 'success', data: task });
  } catch (error) {
    next(error);
  }
};

exports.getStatistics = async (req, res, next) => {
  try {
    const { organizationId } = req.query;

    const stats = await Task.aggregate([
      { $match: { organization: mongoose.Types.ObjectId(organizationId) } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);

    const formatted = {
      total: 0,
      todo: 0,
      in_progress: 0,
      review: 0,
      done: 0,
      cancelled: 0,
    };

    stats.forEach((s) => {
      formatted[s._id] = s.count;
      formatted.total += s.count;
    });

    res.json({ status: 'success', data: formatted });
  } catch (error) {
    next(error);
  }
};
