const { mongoose } = require('@enterprise/shared/config/mongo');

const permissionGroupTemplateSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    grants: [{ type: String, trim: true }],
    isSystem: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

permissionGroupTemplateSchema.index({ key: 1 }, { unique: true });

module.exports = mongoose.model('PermissionGroupTemplate', permissionGroupTemplateSchema);
