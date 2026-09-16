const mongoose = require('../db');

const planningBaselineSchema = new mongoose.Schema(
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
    planVersion: { type: String, required: true, trim: true, maxlength: 32 },
    title: { type: String, trim: true, default: '', maxlength: 240 },
    artifactIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'PlanningArtifact' }],
      default: [],
    },
    artifactSnapshot: {
      type: [
        {
          artifactId: mongoose.Schema.Types.ObjectId,
          kind: String,
          externalKey: String,
          title: String,
          version: Number,
          status: String,
        },
      ],
      default: [],
    },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, required: true },
    approvedAt: { type: Date, required: true, default: Date.now },
    notes: { type: String, trim: true, default: '', maxlength: 2000 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

planningBaselineSchema.index({ projectId: 1, planVersion: 1 }, { unique: true });

module.exports = mongoose.model('PlanningBaseline', planningBaselineSchema);
