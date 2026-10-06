/**
 * Wave M — WBS LLM job document (Mongo).
 */

const mongoose = require('../db');
const { WBS_LLM_JOB_STATUSES } = require('../contracts/howWbsLlmQueueContract');

const wbsLlmJobSchema = new mongoose.Schema(
  {
    runId: { type: String, default: null, maxlength: 128, index: true },
    generationId: { type: String, default: null, maxlength: 128 },
    idempotencyKey: { type: String, required: true, maxlength: 256, unique: true },
    status: {
      type: String,
      enum: WBS_LLM_JOB_STATUSES,
      default: 'queued',
      index: true,
    },
    /** Compact input — no employee PII */
    input: { type: mongoose.Schema.Types.Mixed, default: null },
    result: { type: mongoose.Schema.Types.Mixed, default: null },
    error: { type: String, default: null, maxlength: 512 },
    attempts: { type: Number, default: 0 },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'wbs_llm_jobs' }
);

wbsLlmJobSchema.index({ status: 1, createdAt: 1 });

module.exports =
  mongoose.models.WbsLlmJob || mongoose.model('WbsLlmJob', wbsLlmJobSchema);
