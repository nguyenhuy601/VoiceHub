const mongoose = require('../db');

/**
 * Brief dự án — BGĐ/Admin giao cho PM (chỉ định người quản lý dự án).
 */
const projectBriefSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180,
    },
    body: {
      type: String,
      trim: true,
      default: '',
      maxlength: 4000,
    },
    projectCode: {
      type: String,
      trim: true,
      default: '',
      maxlength: 64,
    },
    dueDate: {
      type: Date,
      default: null,
    },
    /** PM được chỉ định */
    assigneePmId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['open', 'accepted', 'cancelled'],
      default: 'open',
      index: true,
    },
    boardId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
  },
  { timestamps: true }
);

projectBriefSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
projectBriefSchema.index({ assigneePmId: 1, status: 1 });

module.exports = mongoose.model('ProjectBrief', projectBriefSchema);
