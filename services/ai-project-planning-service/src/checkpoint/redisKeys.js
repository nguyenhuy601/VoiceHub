/** G15 Redis key helpers — prefix isolated from auth/rate-limit keys. */

const G15_KEY_PREFIX = 'vh:ai-plan:g15:';

function g15CheckpointKey(runId) {
  const id = String(runId || '').trim();
  if (!id) {
    const err = new Error('runId is required for G15 key');
    err.code = 'G15_RUN_ID_REQUIRED';
    throw err;
  }
  return `${G15_KEY_PREFIX}${id}`;
}

module.exports = {
  G15_KEY_PREFIX,
  g15CheckpointKey,
};
