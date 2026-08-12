const { mongoose } = require('@enterprise/shared/config/mongo');

const hrPositionCatalogSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    normalizedTitle: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
      index: true,
    },
    sortOrder: {
      type: Number,
      default: 100,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

hrPositionCatalogSchema.index({ organizationId: 1, normalizedTitle: 1 }, { unique: true });
hrPositionCatalogSchema.index({ organizationId: 1, sortOrder: 1 });

module.exports = mongoose.model('HrPositionCatalog', hrPositionCatalogSchema);

