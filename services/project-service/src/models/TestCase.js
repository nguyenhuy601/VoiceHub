const mongoose = require('../db');
const { TEST_CASE_STATUSES } = require('../utils/work/testCaseTypes');

const testCaseSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    code: {
      type: String,
      required: true,
      trim: true,
      maxlength: 32,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 240,
    },
    externalKey: {
      type: String,
      trim: true,
      default: '',
      maxlength: 64,
    },
    status: {
      type: String,
      enum: TEST_CASE_STATUSES,
      default: 'draft',
      index: true,
    },
    lastResult: {
      type: String,
      enum: ['pass', 'fail', null],
      default: null,
    },
    lastExecutedAt: {
      type: Date,
      default: null,
    },
    lastExecutedBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    linkedBugId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      default: null,
    },
    /** Hard link TC → work item (Board card). Required for ready-to-done proposal. */
    workItemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      default: null,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

testCaseSchema.index({ projectId: 1, code: 1 }, { unique: true });
testCaseSchema.index({ projectId: 1, isActive: 1, createdAt: -1 });
testCaseSchema.index({ projectId: 1, workItemId: 1, isActive: 1 });

module.exports = mongoose.model('TestCase', testCaseSchema);
