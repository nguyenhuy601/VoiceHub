/**
 * Optimistic concurrency for backlog draft writes / Gate1 approve.
 */

function assertDraftRevision(currentRevisionId, expectedDraftRevisionId) {
  const current =
    currentRevisionId === undefined || currentRevisionId === null
      ? null
      : String(currentRevisionId);
  const expected =
    expectedDraftRevisionId === undefined || expectedDraftRevisionId === null
      ? null
      : String(expectedDraftRevisionId);

  // First write: allow expected null/0 when current null/0
  if ((current == null || current === '' || current === '0') && (expected == null || expected === '' || expected === '0')) {
    return { ok: true };
  }
  if (expected == null || expected === '') {
    return {
      ok: false,
      code: 'DRAFT_REVISION_CONFLICT',
      message: 'expectedDraftRevisionId required when draft already exists',
      currentRevisionId: current,
    };
  }
  if (String(current) !== String(expected)) {
    return {
      ok: false,
      code: 'DRAFT_REVISION_CONFLICT',
      message: 'Draft revision mismatch — reload and reconcile; overwrite forbidden',
      currentRevisionId: current,
      expectedDraftRevisionId: expected,
      statusCode: 409,
    };
  }
  return { ok: true };
}

function nextDraftRevision(currentRevisionId) {
  const n = Number(currentRevisionId);
  if (Number.isFinite(n) && n >= 0) return n + 1;
  return 1;
}

module.exports = {
  assertDraftRevision,
  nextDraftRevision,
};
