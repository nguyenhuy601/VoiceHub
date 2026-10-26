/**
 * Durable LlmJob row. Workflow checkpoint stays in LangGraph.
 */

const mongoose = require('../db');
const { LLM_JOB_STATUSES, LLM_JOB_SCHEMA_VERSION } = require('./llmJobContract');

const llmJobSchema = new mongoose.Schema(
  {
    jobId: { type: String, required: true, maxlength: 128, unique: true },
    runId: { type: String, default: null, maxlength: 128, index: true },
    snapshotId: { type: String, default: null, maxlength: 128, index: true },
    stepId: { type: String, default: null, maxlength: 128 },
    jobType: { type: String, required: true, maxlength: 64, index: true },
    phase: { type: String, enum: ['WHAT', 'HOW', null], default: null },
    status: {
      type: String,
      enum: LLM_JOB_STATUSES,
      default: 'pending',
      index: true,
    },
    attempt: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 },
    inputVersion: { type: String, default: null, maxlength: 64 },
    contextRef: { type: String, default: null, maxlength: 256 },
    factsRef: { type: String, default: null, maxlength: 256 },
    allowedSources: { type: [String], default: [] },
    promptVersion: { type: String, default: null, maxlength: 64 },
    schemaVersion: { type: String, default: LLM_JOB_SCHEMA_VERSION, maxlength: 32 },
    idempotencyKey: { type: String, required: true, maxlength: 256, unique: true },
    waveId: { type: String, default: null, maxlength: 128, index: true },
    toolName: { type: String, default: null, maxlength: 64 },
    generation: { type: mongoose.Schema.Types.Mixed, default: null },
    execution: { type: mongoose.Schema.Types.Mixed, default: null },
    payload: { type: mongoose.Schema.Types.Mixed, default: null },
    result: { type: mongoose.Schema.Types.Mixed, default: null },
    error: { type: String, default: null, maxlength: 512 },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    leaseUntil: { type: Date, default: null },
  },
  { timestamps: true, collection: 'llm_jobs' }
);

llmJobSchema.index({ runId: 1, waveId: 1 });
llmJobSchema.index({ status: 1, leaseUntil: 1 });

module.exports = mongoose.models.LlmJob || mongoose.model('LlmJob', llmJobSchema);
