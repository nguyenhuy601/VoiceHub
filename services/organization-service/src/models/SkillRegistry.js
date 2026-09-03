const { mongoose } = require('@enterprise/shared/config/mongo');

const SKILL_REGISTRY_STATUS = ['ACTIVE', 'PENDING', 'REJECTED'];
const SKILL_REGISTRY_SOURCE = ['Admin', 'Import', 'AI', 'Employee'];

const skillRegistrySchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 128 },
    normalizedName: { type: String, required: true, trim: true, maxlength: 128 },
    category: { type: String, trim: true, default: '', maxlength: 64 },
    aliases: { type: [String], default: [] },
    relatedSkillIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'SkillRegistry' }],
      default: [],
    },
    parentSkillId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SkillRegistry',
      default: null,
    },
    status: {
      type: String,
      enum: SKILL_REGISTRY_STATUS,
      default: 'PENDING',
      index: true,
    },
    source: {
      type: String,
      enum: SKILL_REGISTRY_SOURCE,
      default: 'Import',
    },
    reviewNote: { type: String, trim: true, default: '', maxlength: 500 },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

skillRegistrySchema.index({ organizationId: 1, normalizedName: 1 }, { unique: true });
skillRegistrySchema.index({ organizationId: 1, status: 1, name: 1 });

module.exports = mongoose.model('SkillRegistry', skillRegistrySchema);
module.exports.SKILL_REGISTRY_STATUS = SKILL_REGISTRY_STATUS;
module.exports.SKILL_REGISTRY_SOURCE = SKILL_REGISTRY_SOURCE;
