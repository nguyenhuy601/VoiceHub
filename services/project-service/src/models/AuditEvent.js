const mongoose = require('../db');

/**
 * Append-only field-level audit (Phase 6). Không update/delete qua API user.
 */
const auditEventSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    actorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    action: {
      type: String,
      required: true,
      trim: true,
      maxlength: 96,
      index: true,
    },
    resourceType: {
      type: String,
      required: true,
      trim: true,
      maxlength: 48,
      index: true,
    },
    resourceId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 64,
      index: true,
    },
    before: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    after: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    requestId: {
      type: String,
      trim: true,
      default: '',
      maxlength: 96,
      index: true,
    },
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditEventSchema.index({ organizationId: 1, createdAt: -1 });
auditEventSchema.index({ organizationId: 1, resourceType: 1, resourceId: 1, createdAt: -1 });

module.exports = mongoose.model('AuditEvent', auditEventSchema);
