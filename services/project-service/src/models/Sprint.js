const mongoose = require('../db');

const sprintSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
      ref: 'Project',
    },
    /** Optional filter — sprint có thể gắn một board trong project */
    boardId: {
      type: mongoose.Schema.Types.ObjectId,
      required: false,
      default: null,
      index: true,
      ref: 'TaskBoard',
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180,
    },
    goal: {
      type: String,
      trim: true,
      default: '',
      maxlength: 2000,
    },
    startDate: {
      type: Date,
      default: null,
    },
    endDate: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ['planned', 'active', 'closed'],
      default: 'planned',
      index: true,
    },
    reviewNotes: {
      type: String,
      trim: true,
      default: '',
      maxlength: 4000,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
  },
  { timestamps: true }
);

sprintSchema.index({ projectId: 1, status: 1, createdAt: -1 });
sprintSchema.index({ boardId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('Sprint', sprintSchema);
