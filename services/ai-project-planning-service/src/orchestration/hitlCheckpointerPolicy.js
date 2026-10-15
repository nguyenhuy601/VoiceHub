/**
 * Hybrid HITL — durable checkpointer required when in-run interrupt is on.
 * No Postgres: Redis + RedisJSON only (see docs/ai-project/hybrid-hitl-langgraph.md).
 */

const { isHitlInterruptEnabled } = require('./hitlInterrupt');

/**
 * @param {{ kind: 'redis'|'memory'|string, env?: NodeJS.ProcessEnv }} opts
 * @throws {{ code: 'HITL_CHECKPOINTER_NOT_DURABLE' }}
 */
function assertDurableCheckpointerForInRunHitl({ kind, env = process.env } = {}) {
  if (!isHitlInterruptEnabled(env)) return { ok: true, skipped: true };
  const k = String(kind || '').trim().toLowerCase();
  if (k === 'redis') return { ok: true, skipped: false };
  const err = new Error(
    'In-run HITL (AGENT_CORE_HITL_INTERRUPT) requires durable Redis+RedisJSON checkpointer — MemorySaver / AGENT_CORE_LG_MEMORY=1 is not allowed'
  );
  err.code = 'HITL_CHECKPOINTER_NOT_DURABLE';
  throw err;
}

module.exports = {
  assertDurableCheckpointerForInRunHitl,
};
