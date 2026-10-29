/**
 * JSON artifact on redis-lg. Key is jobType + input hash. No SRS, no Gate, no agentCheckpoint.
 */

const { HOW_ARTIFACT_SCHEMA_VERSION } = require('./artifactHash');
const { runOnArtifactRedis } = require('./artifactRedis');

function artifactKey(jobType, inputHash) {
  const job = String(jobType || 'how').replace(/[^a-z0-9_-]/gi, '') || 'how';
  const hash = String(inputHash || '').replace(/[^a-f0-9]/gi, '');
  return `vh:ai-plan:artifact:${job}:${hash}`;
}

function parseRecord(raw) {
  if (!raw) return null;
  try {
    const record = JSON.parse(raw);
    return record && typeof record === 'object' ? record : null;
  } catch {
    return null;
  }
}

async function getArtifact(jobType, inputHash, opts = {}) {
  const key = artifactKey(jobType, inputHash);
  const result = await runOnArtifactRedis(opts.env, opts.redis, async (redis) => {
    const raw = await redis.get(key);
    return { ok: true, record: parseRecord(raw) };
  });
  if (!result || result.ok === false) {
    return { ok: false, reason: result?.reason || 'redis_error', record: null };
  }
  return result;
}

async function putArtifact(jobType, inputHash, record, opts = {}) {
  const key = artifactKey(jobType, inputHash);
  const body = {
    schemaVersion: HOW_ARTIFACT_SCHEMA_VERSION,
    jobType: String(jobType || ''),
    inputHash: String(inputHash || ''),
    status: record?.status === 'FAILED' ? 'FAILED' : 'VALIDATED',
    model: record?.model || null,
    storedAt: new Date().toISOString(),
  };
  if (body.status === 'VALIDATED') {
    body.data = record.data;
    if (record.usage) body.usage = record.usage;
  } else {
    body.reason = String(record?.reason || 'llm_failed').slice(0, 200);
  }
  const result = await runOnArtifactRedis(opts.env, opts.redis, async (redis) => {
    await redis.set(key, JSON.stringify(body));
    return { ok: true };
  });
  if (!result || result.ok === false) {
    return { ok: false, reason: result?.reason || 'redis_error' };
  }
  return result;
}

function isServableArtifact(record) {
  return (
    record &&
    record.status === 'VALIDATED' &&
    record.schemaVersion === HOW_ARTIFACT_SCHEMA_VERSION &&
    record.data != null &&
    typeof record.data === 'object'
  );
}

module.exports = {
  artifactKey,
  getArtifact,
  putArtifact,
  isServableArtifact,
};
