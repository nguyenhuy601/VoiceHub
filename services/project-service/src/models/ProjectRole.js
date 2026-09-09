const mongoose = require('../db');

/**
 * Project Role:
 * - projectId null → org default template (Admin matrix)
 * - projectId set → bản roles/permissions của một dự án (Hub Settings)
 */
const projectRoleSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    /** null = org default; ObjectId = bản clone theo dự án */
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
      ref: 'Project',
    },
    key: {
      type: String,
      required: true,
      trim: true,
      maxlength: 64,
    },
    label: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    /** Capability: được phép khởi tạo assign (vẫn cần cạnh Delegation Graph). */
    canAssign: {
      type: Boolean,
      default: false,
    },
    /** Phase 2 — permission keys resource:action */
    permissions: {
      type: [{ type: String, trim: true, maxlength: 64 }],
      default: [],
    },
    isSystem: {
      type: Boolean,
      default: false,
    },
    sortOrder: {
      type: Number,
      default: 100,
    },
  },
  { timestamps: true }
);

projectRoleSchema.index(
  { organizationId: 1, key: 1 },
  { unique: true, partialFilterExpression: { projectId: null } }
);
projectRoleSchema.index(
  { projectId: 1, key: 1 },
  { unique: true, partialFilterExpression: { projectId: { $type: 'objectId' } } }
);

module.exports = mongoose.model('ProjectRole', projectRoleSchema);
