/**
 * HOW generateJson cache. Accept stays in the caller. Redis errors call the model.
 */

const { generateJson, ollamaModel } = require('../runtime/ollamaGenerate');
const {
  HOW_ARTIFACT_PROMPT_VERSION,
  hashArtifactInput,
} = require('./artifactHash');
const { artifactRedisUrl } = require('./artifactRedis');
const { getArtifact, putArtifact, isServableArtifact } = require('./artifactStore');
const {
  DEFAULT_LEASE_MS,
  DEFAULT_RENEW_MS,
  claimArtifactLock,
  renewArtifactLock,
  releaseArtifactLock,
} = require('./artifactLock');

let missingUrlLogged = false;

function isArtifactStoreEnabled(env = process.env) {
  return String(env.ARTIFACT_STORE ?? '').trim() === '1';
}

function logArtifact(event, jobType, inputHash, llmCalls) {
  const hash = String(inputHash || '').slice(0, 12);
  console.info(`[${event}] jobType=${jobType || ''} hash=${hash} llmCalls=${llmCalls}`);
}

function noteMissingUrl(jobType) {
  if (missingUrlLogged) return;
  missingUrlLogged = true;
  console.info(
    `[artifact_store_bypass] jobType=${jobType || ''} hash= llmCalls=1 reason=missing_LG_REDIS_URL`
  );
}

function sleep(ms, sleepImpl) {
  if (typeof sleepImpl === 'function') return sleepImpl(ms);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hitResult(record) {
  return {
    ok: true,
    model: record.model || null,
    data: record.data,
    usage: record.usage || { promptEvalCount: 0, evalCount: 0 },
    cacheHit: true,
  };
}

function startRenew(jobType, inputHash, token, redisOpts, leaseMs, renewMs) {
  const timer = setInterval(() => {
    renewArtifactLock(jobType, inputHash, token, { ...redisOpts, leaseMs }).catch(() => {});
  }, renewMs);
  if (typeof timer.unref === 'function') timer.unref();
  return () => clearInterval(timer);
}

async function storeOutcome(jobType, inputHash, model, out, redisOpts) {
  const storable = Boolean(out && out.ok === true && out.data != null && typeof out.data === 'object');
  if (storable) {
    await putArtifact(
      jobType,
      inputHash,
      { status: 'VALIDATED', model: out.model || model, data: out.data, usage: out.usage },
      redisOpts
    );
    return;
  }
  await putArtifact(
    jobType,
    inputHash,
    {
      status: 'FAILED',
      model: out?.model || model,
      reason: out?.error || 'llm_failed',
    },
    redisOpts
  );
}

async function generateHoldingLock(opts, inputHash, model, generate, redisOpts, claim) {
  const leaseMs = claim.leaseMs || DEFAULT_LEASE_MS;
  const renewMs = Number(opts.renewMs) > 0 ? Number(opts.renewMs) : DEFAULT_RENEW_MS;
  const stopRenew = startRenew(opts.jobType, inputHash, claim.token, redisOpts, leaseMs, renewMs);
  try {
    const out = await generate(opts);
    await storeOutcome(opts.jobType, inputHash, model, out, redisOpts);
    return out;
  } finally {
    stopRenew();
    await releaseArtifactLock(opts.jobType, inputHash, claim.token, redisOpts);
  }
}

async function cachedGenerateJson(opts = {}) {
  const env = opts.env || process.env;
  const generate = typeof opts.generateJsonFn === 'function' ? opts.generateJsonFn : generateJson;
  if (!isArtifactStoreEnabled(env)) return generate(opts);

  const redisOpts = { env, redis: opts.redis };
  if (!opts.redis && !artifactRedisUrl(env)) {
    noteMissingUrl(opts.jobType);
    return generate(opts);
  }

  const model = ollamaModel(env);
  const inputHash = hashArtifactInput({
    jobType: opts.jobType,
    model,
    promptVersion: HOW_ARTIFACT_PROMPT_VERSION,
    numPredict: opts.numPredict,
    numCtx: opts.numCtx,
    temperature: opts.temperature,
    prompt: opts.prompt,
  });

  const leaseMs = Number(opts.leaseMs) >= 1000 ? Math.round(Number(opts.leaseMs)) : DEFAULT_LEASE_MS;
  const pollMs = Number(opts.pollMs) > 0 ? Math.round(Number(opts.pollMs)) : 250;
  const timeoutMs = Number(opts.timeoutMs);
  const deadline = Date.now() + Math.max(leaseMs, Number.isFinite(timeoutMs) ? timeoutMs : leaseMs);
  let loggedWait = false;

  while (Date.now() <= deadline) {
    const current = await getArtifact(opts.jobType, inputHash, redisOpts);
    if (!current.ok) {
      logArtifact('artifact_store_bypass', opts.jobType, inputHash, 1);
      return generate(opts);
    }
    if (isServableArtifact(current.record)) {
      logArtifact('artifact_hit', opts.jobType, inputHash, 0);
      return hitResult(current.record);
    }

    const claim = await claimArtifactLock(opts.jobType, inputHash, { ...redisOpts, leaseMs });
    if (!claim.ok) {
      logArtifact('artifact_store_bypass', opts.jobType, inputHash, 1);
      return generate(opts);
    }
    if (claim.claimed) {
      logArtifact('artifact_miss', opts.jobType, inputHash, 1);
      return generateHoldingLock(opts, inputHash, model, generate, redisOpts, claim);
    }

    if (!loggedWait) {
      logArtifact('artifact_lock_wait', opts.jobType, inputHash, 0);
      loggedWait = true;
    }
    await sleep(pollMs, opts.sleepImpl);
  }

  logArtifact('artifact_store_bypass', opts.jobType, inputHash, 1);
  return generate(opts);
}

function resetArtifactCacheForTests() {
  missingUrlLogged = false;
}

module.exports = {
  isArtifactStoreEnabled,
  cachedGenerateJson,
  resetArtifactCacheForTests,
};
