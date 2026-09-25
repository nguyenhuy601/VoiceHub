const mongoose = require('../db');

const RUN_STATUSES = [
  'queued',
  'running',
  'callback_pending',
  'callback_delivering',
  'waiting_human',
  'replanning',
  'completed',
  'failed',
  'cancelled',
  'expired',
];

const planningRunSchema = new mongoose.Schema(
  {
    projectId: { type: String, default: null, maxlength: 128, index: true },
    packId: { type: String, default: null, maxlength: 128, index: true },
    organizationId: { type: String, default: null, maxlength: 128, index: true },
    snapshotId: { type: String, required: true, maxlength: 128, immutable: true, index: true },
    approvedSrsVersion: { type: String, default: null, maxlength: 128 },
    snapshotPayloadRef: { type: String, default: null, maxlength: 256 },
    trigger: { type: String, default: 'manual', maxlength: 64 },
    initiatedBy: { type: String, default: null, maxlength: 128 },
    status: {
      type: String,
      enum: RUN_STATUSES,
      default: 'queued',
      index: true,
    },
    currentNode: { type: String, default: null },
    iteration: { type: Number, default: 0 },
    attempt: { type: Number, default: 0 },
    startedAt: { type: Date, default: null },
    executionClaimedAt: { type: Date, default: null },
    executionLeaseOwner: { type: String, default: null, maxlength: 128 },
    executionLeaseExpiresAt: { type: Date, default: null, index: true },
    completedAt: { type: Date, default: null },
    error: { type: mongoose.Schema.Types.Mixed, default: null },
    /**
     * @deprecated G15 AgentState SoT is Redis (`vh:ai-plan:g15:{runId}`).
     * Field retained for legacy docs; do not write new checkpoints here.
     */
    checkpoint: { type: mongoose.Schema.Types.Mixed, default: null },
    /** Metadata only — last successful G15 Redis save (not AgentState body). */
    lastCheckpointAt: { type: Date, default: null },
    lastFeedback: { type: mongoose.Schema.Types.Mixed, default: null },
    job: { type: String, default: null, maxlength: 64, index: true },
    activeKey: { type: String, maxlength: 256, index: true, unique: true, sparse: true },
    idempotencyKey: { type: String, default: null, maxlength: 256, index: true },
    input: { type: mongoose.Schema.Types.Mixed, default: null, immutable: true },
    result: { type: mongoose.Schema.Types.Mixed, default: null },
    evidence: { type: [mongoose.Schema.Types.Mixed], default: [] },
    callbackPayload: { type: mongoose.Schema.Types.Mixed, default: null },
    callbackAttempts: { type: Number, default: 0 },
    callbackNextRetryAt: { type: Date, default: null },
    callbackLeaseOwner: { type: String, default: null, maxlength: 128 },
    callbackLeaseExpiresAt: { type: Date, default: null, index: true },
    callbackLastError: { type: mongoose.Schema.Types.Mixed, default: null },
    callbackAckedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

planningRunSchema.index({ packId: 1, status: 1 });
planningRunSchema.index({ packId: 1, job: 1, idempotencyKey: 1 });

const PlanningRun =
  mongoose.models.PlanningRun || mongoose.model('PlanningRun', planningRunSchema);

module.exports = {
  PlanningRun,
  RUN_STATUSES,
};
