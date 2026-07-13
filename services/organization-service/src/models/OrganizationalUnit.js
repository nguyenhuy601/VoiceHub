/**
 * Huy: Organizational Unit — nút cây N-level (Division/Department/Team/Squad/…).
 */
const { mongoose } = require('@enterprise/shared/config/mongo');

const organizationalUnitSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    parentUnitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'OrganizationalUnit',
      default: null,
      index: true,
    },
    levelKey: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    unitKind: {
      type: String,
      default: 'custom',
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    attributes: {
      location: { type: String, default: '', trim: true },
      headUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      leaderUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      isDefault: { type: Boolean, default: false },
      isActive: { type: Boolean, default: true },
    },
    path: {
      type: String,
      default: '',
      index: true,
    },
    depth: {
      type: Number,
      default: 0,
      min: 0,
    },
    legacyRef: {
      collection: { type: String, default: null },
      id: { type: mongoose.Schema.Types.ObjectId, default: null },
    },
  },
  { timestamps: true }
);

organizationalUnitSchema.index({ organization: 1, parentUnitId: 1, name: 1 });
organizationalUnitSchema.index({ organization: 1, levelKey: 1, 'attributes.isActive': 1 });
organizationalUnitSchema.index(
  { organization: 1, 'legacyRef.collection': 1, 'legacyRef.id': 1 },
  { sparse: true }
);

module.exports = mongoose.model('OrganizationalUnit', organizationalUnitSchema);
