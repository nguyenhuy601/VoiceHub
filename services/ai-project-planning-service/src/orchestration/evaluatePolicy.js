/**
 * G8 Evaluate policy — decide CONTINUE | RETRIEVE | NEED_TOOL (pure-JS, Wave F / Track B).
 * Does not compute business metrics (≠ G13).
 * Optional JEV3 advisory when JEV_CONTROL=1 (RULE-12 — never replaces G13).
 */

/**
 * @param {{
 *   evaluate?: { enoughInfoToContinue?: boolean, reason?: string },
 *   contextPackage?: { citations?: object[] },
 *   toolResults?: object[],
 * }} input
 * @returns {{ action: 'CONTINUE'|'RETRIEVE'|'NEED_TOOL', query?: string, reason: string, jev3?: object }}
 */
function decideEvaluateAction(input = {}) {
  const evaluate = input.evaluate || {};
  const citations = Array.isArray(input.contextPackage?.citations)
    ? input.contextPackage.citations
    : [];
  const toolResults = Array.isArray(input.toolResults) ? input.toolResults : [];

  let decision;
  if (evaluate.enoughInfoToContinue === false) {
    if (citations.length === 0) {
      decision = {
        action: 'RETRIEVE',
        query: 'missing_context_for_planning',
        reason: evaluate.reason || 'not_enough_info_no_citations',
      };
    } else if (toolResults.length === 0) {
      decision = {
        action: 'NEED_TOOL',
        reason: evaluate.reason || 'not_enough_info_no_tools',
      };
    } else {
      decision = {
        action: 'NEED_TOOL',
        reason: evaluate.reason || 'not_enough_info_need_more_tools',
      };
    }
  } else {
    decision = {
      action: 'CONTINUE',
      reason: evaluate.reason || 'enough_info',
    };
  }

  try {
    const {
      isJevControlEnabled,
      evaluateJev3Supervisor,
    } = require('./jevControl');
    if (isJevControlEnabled()) {
      const jev3 = evaluateJev3Supervisor({
        evaluate,
        contextPackage: input.contextPackage,
        toolResults,
      });
      decision.jev3 = jev3;
      if (
        evaluate.enoughInfoToContinue === false &&
        jev3.suggest &&
        jev3.suggest !== decision.action
      ) {
        decision.action = jev3.suggest;
        decision.reason = `${decision.reason}+jev3:${jev3.reason}`;
      }
    }
  } catch {
    /* jev optional */
  }

  return decision;
}

module.exports = { decideEvaluateAction };
