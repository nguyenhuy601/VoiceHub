/**
 * Agent Core F2 feature flag — LangGraph HOW path.
 * Default OFF: pure-JS agentLoopRunner remains production SoT (RULE-F2-02).
 */

function isAgentCoreF2Enabled(env = process.env) {
  const raw = String(env.AGENT_CORE_F2 ?? '0').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes';
}

module.exports = { isAgentCoreF2Enabled };
