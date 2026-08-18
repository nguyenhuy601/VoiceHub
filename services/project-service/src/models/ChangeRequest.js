const mongoose = require('../db');
const {
  CHANGE_REQUEST_TYPES,
  CHANGE_REQUEST_PRIORITIES,
  CHANGE_REQUEST_STATUSES,
} = require('../utils/changeRequestTypes');

const changeRequestSchema = new mongoose.Schema(
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
    seq: {
      type: Number,
      required: true,
      min: 1,
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
    description: {
      type: String,
      trim: true,
      default: '',
      maxlength: 4000,
    },
    type: {
      type: String,
      enum: CHANGE_REQUEST_TYPES,
      required: true,
      index: true,
    },
    priority: {
      type: String,
      enum: CHANGE_REQUEST_PRIORITIES,
      default: 'medium',
      index: true,
    },
    status: {
      type: String,
      enum: CHANGE_REQUEST_STATUSES,
      default: 'draft',
      index: true,
    },
    reason: {
      type: String,
      trim: true,
      default: '',
      maxlength: 2000,
    },
    current: {
      type: String,
      trim: true,
      default: '',
      maxlength: 4000,
    },
    requestedChange: {
      type: String,
      trim: true,
      default: '',
      maxlength: 4000,
    },
    impact: {
      affectedRequirement: { type: String, trim: true, default: '', maxlength: 2000 },
      affectedFeature: { type: String, trim: true, default: '', maxlength: 2000 },
      affectedSprint: { type: String, trim: true, default: '', maxlength: 500 },
      affectedTeam: { type: String, trim: true, default: '', maxlength: 500 },
      estimatedEffort: { type: String, trim: true, default: '', maxlength: 500 },
      scheduleImpact: { type: String, trim: true, default: '', maxlength: 2000 },
      costImpact: { type: String, trim: true, default: '', maxlength: 2000 },
      risk: { type: String, trim: true, default: '', maxlength: 2000 },
    },
    workItemIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }],
      default: [],
    },
    /** Denorm: lowest linked work status key. Empty when no work linked. */
    workStatus: {
      type: String,
      trim: true,
      default: '',
      maxlength: 64,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    activity: {
      type: [
        {
          type: {
            type: String,
            default: 'status_changed',
            trim: true,
            maxlength: 64,
          },
          from: {
            type: String,
            trim: true,
            maxlength: 32,
            default: '',
          },
          to: {
            type: String,
            trim: true,
            maxlength: 32,
            default: '',
          },
          at: {
            type: Date,
            default: Date.now,
          },
          actorId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
          },
        },
      ],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

changeRequestSchema.index({ projectId: 1, code: 1 }, { unique: true });
changeRequestSchema.index({ projectId: 1, isActive: 1, createdAt: -1 });
changeRequestSchema.index({ projectId: 1, status: 1 });
changeRequestSchema.index({ projectId: 1, workStatus: 1 });
changeRequestSchema.index({ organizationId: 1, createdAt: -1 });
changeRequestSchema.index({ projectId: 1, workItemIds: 1 });

module.exports = mongoose.model('ChangeRequest', changeRequestSchema);
