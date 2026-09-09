/**
 * Analytics warehouse — user performance rollup (ADR-003).
 * Chỉ dùng khi ANALYTICS_MONGODB_URI hoặc MONGODB_URI riêng cho report-service.
 */

const mongoose = require('mongoose');

const userPerformanceRollupSchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    windowDays: { type: Number, required: true, default: 90 },
    asOf: { type: Date, required: true },
    sampleSize: { type: Object, default: {} },
    velocity: { type: Object, default: {} },
    cycleTimeHours: { type: Object, default: {} },
    estimation: { type: Object, default: {} },
    quality: { type: Object, default: {} },
    experience: { type: Object, default: {} },
    confidence: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'low',
    },
    source: {
      type: String,
      enum: ['etl', 'c2_upsert', 'rebuild'],
      default: 'etl',
    },
    eventId: { type: String, default: '' },
  },
  { timestamps: true, collection: 'user_performance_rollup' }
);

userPerformanceRollupSchema.index(
  { organizationId: 1, userId: 1, windowDays: 1 },
  { unique: true }
);

module.exports =
  mongoose.models.UserPerformanceRollup ||
  mongoose.model('UserPerformanceRollup', userPerformanceRollupSchema);
