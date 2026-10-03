/**
 * GateSubmission immutable manifest helpers (pure).
 */

const crypto = require('crypto');
const { stableStringify } = require('./artifactRevision');

function newSubmissionId() {
  const ts = Date.now().toString(36);
  const rnd = crypto.randomBytes(4).toString('hex');
  return `SUB-${ts}-${rnd}`;
}

function newReviewId() {
  const ts = Date.now().toString(36);
  const rnd = crypto.randomBytes(4).toString('hex');
  return `G1-REV-${ts}-${rnd}`;
}

/**
 * @param {Array<{ logicalId: string, revisionId: string, action?: string }>} entries
 * @returns {Array<{ logicalId: string, revisionId: string, action: string|null }>}
 */
function normalizeRevisionManifest(entries) {
  const list = Array.isArray(entries) ? entries : [];
  const normalized = list
    .filter((e) => e && e.logicalId && e.revisionId)
    .map((e) => ({
      logicalId: String(e.logicalId),
      revisionId: String(e.revisionId),
      action: e.action != null ? String(e.action).toLowerCase() : null,
    }))
    .sort((a, b) => a.logicalId.localeCompare(b.logicalId));
  return normalized;
}

/**
 * @param {Array<{ logicalId: string, revisionId: string, action?: string }>} entries
 */
function hashRevisionManifest(entries) {
  const normalized = normalizeRevisionManifest(entries);
  const digest = crypto.createHash('sha256').update(stableStringify(normalized)).digest('hex');
  return `sha256:${digest}`;
}

/**
 * Build submission document (not persisted).
 */
function buildGateSubmissionDoc({
  submissionId,
  organizationId,
  projectId = null,
  packId,
  reviewId,
  sequenceNo,
  revisionManifest,
  snapshotId = null,
  reviewPolicyVersion = 'GATE1-SOP-1.0',
  submittedBy,
  submittedAt = null,
  status = 'ACTIVE',
}) {
  const manifest = normalizeRevisionManifest(revisionManifest);
  return {
    submissionId: submissionId || newSubmissionId(),
    organizationId,
    projectId,
    packId,
    reviewId: String(reviewId),
    sequenceNo: Number(sequenceNo) || 1,
    revisionManifest: manifest,
    manifestHash: hashRevisionManifest(manifest),
    snapshotId: snapshotId ? String(snapshotId) : null,
    reviewPolicyVersion: String(reviewPolicyVersion || 'GATE1-SOP-1.0'),
    status,
    submittedBy,
    submittedAt: submittedAt || new Date().toISOString(),
  };
}

/**
 * Build manifest entries from current decisions + tip revision map.
 * @param {object} decisions - review.decisions map
 * @param {Record<string, string>} tipRevisionByLogicalId
 */
function buildManifestFromDecisions(decisions, tipRevisionByLogicalId = {}) {
  const entries = [];
  const map = decisions && typeof decisions === 'object' ? decisions : {};
  for (const [logicalId, d] of Object.entries(map)) {
    const revisionId =
      (d && d.revisionId) || tipRevisionByLogicalId[logicalId] || null;
    if (!revisionId) continue;
    entries.push({
      logicalId,
      revisionId: String(revisionId),
      action: d?.action || null,
    });
  }
  return normalizeRevisionManifest(entries);
}

module.exports = {
  newSubmissionId,
  newReviewId,
  normalizeRevisionManifest,
  hashRevisionManifest,
  buildGateSubmissionDoc,
  buildManifestFromDecisions,
};
