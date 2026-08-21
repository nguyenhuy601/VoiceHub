/**
 * Fact staging cho ETL — cập nhật incremental rồi rebuild rollup.
 */

const mongoose = require('mongoose');

const analyticsFactSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true },
    type: { type: String, required: true, index: true },
    organizationId: { type: String, index: true },
    projectId: { type: String, index: true },
    occurredAt: { type: Date, default: Date.now, index: true },
    payload: { type: Object, default: {} },
  },
  { timestamps: true, collection: 'analytics_facts' }
);

analyticsFactSchema.index({ organizationId: 1, type: 1, occurredAt: -1 });

module.exports =
  mongoose.models.AnalyticsFact || mongoose.model('AnalyticsFact', analyticsFactSchema);
