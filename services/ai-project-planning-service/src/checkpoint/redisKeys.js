/** Planning checkpoint Redis key helpers — prefix isolated from auth/rate-limit keys. */

const CHECKPOINT_KEY_PREFIX = 'vh:ai-plan:checkpoint:';

function checkpointKey(runId) {
  const id = String(runId || '').trim();
  if (!id) {
    const err = new Error('runId is required for checkpoint key');
    err.code = 'CHECKPOINT_RUN_ID_REQUIRED';
    throw err;
  }
  return `${CHECKPOINT_KEY_PREFIX}${id}`;
}

module.exports = {
  CHECKPOINT_KEY_PREFIX,
  checkpointKey,
};
