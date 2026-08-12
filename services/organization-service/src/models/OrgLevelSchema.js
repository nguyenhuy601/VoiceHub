/**
 * Huy: Cấu hình Organizational Level theo từng Organization (dynamic hierarchy).
 */
const { mongoose } = require('@enterprise/shared/config/mongo');

const levelDefSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    order: { type: Number, required: true, min: 1 },
    enabled: { type: Boolean, default: true },
    allowsChildren: { type: Boolean, default: true },
  },
  { _id: false }
);

const orgLevelSchemaSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      unique: true,
      index: true,
    },
    levels: {
      type: [levelDefSchema],
      default: [],
    },
    templateId: {
      type: String,
      default: 'enterprise-compat',
      trim: true,
    },
    /** Huy: Setup một lần — sau khi set không cho PUT đổi levels/template */
    setupCompletedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('OrgLevelSchema', orgLevelSchemaSchema);
