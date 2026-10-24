/**
 * Durable WBS chunk work unit. Not the workflow checkpoint and not the WBS tree.
 */

const mongoose = require('../db');
const { WBS_WORK_UNIT_STATUSES } = require('./wbsChunkContract');

const wbsWorkUnitSchema = new mongoose.Schema(
  {
    workUnitId: { type: String, required: true, maxlength: 128, unique: true },
    runId: { type: String, required: true, maxlength: 128, index: true },
    generationId: { type: String, default: null, maxlength: 128 },
    type: { type: String, required: true, maxlength: 64 },
    status: {
      type: String,
      enum: WBS_WORK_UNIT_STATUSES,
      default: 'PENDING',
      index: true,
    },
    attempt: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 },
    inputSnapshotId: { type: String, required: true, maxlength: 128, index: true },
    schemaVersion: { type: String, required: true, maxlength: 32 },
    idempotencyKey: { type: String, required: true, maxlength: 256, unique: true },
    chunkIndex: { type: Number, required: true },
    input: { type: mongoose.Schema.Types.Mixed, default: null },
    result: { type: mongoose.Schema.Types.Mixed, default: null },
    resultRef: { type: String, default: null, maxlength: 128 },
    error: { type: String, default: null, maxlength: 512 },
    retryable: { type: Boolean, default: true },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    leaseUntil: { type: Date, default: null },
  },
  { timestamps: true, collection: 'wbs_work_units' }
);

wbsWorkUnitSchema.index({ runId: 1, chunkIndex: 1 });

module.exports =
  mongoose.models.WbsWorkUnit || mongoose.model('WbsWorkUnit', wbsWorkUnitSchema);
