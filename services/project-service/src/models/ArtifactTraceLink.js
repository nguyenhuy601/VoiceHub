const mongoose = require('../db');
const { ARTIFACT_TRACE_LINK_TYPES } = require('../constants/analysisArtifact');

const artifactTraceLinkSchema = new mongoose.Schema(
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
    fromArtifactId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AnalysisArtifact',
      required: true,
      index: true,
    },
    toArtifactId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AnalysisArtifact',
      required: true,
      index: true,
    },
    linkType: {
      type: String,
      enum: ARTIFACT_TRACE_LINK_TYPES,
      required: true,
      index: true,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, required: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

artifactTraceLinkSchema.index(
  { projectId: 1, fromArtifactId: 1, toArtifactId: 1, linkType: 1 },
  { unique: true }
);

module.exports = mongoose.model('ArtifactTraceLink', artifactTraceLinkSchema);
