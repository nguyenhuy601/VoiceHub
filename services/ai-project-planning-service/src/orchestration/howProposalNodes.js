/**
 * Helpers for HOW Node 4 LLM propose — CTX from contextPackage (no mutate).
 */

const { formatRetrievedContext } = require('../retrieval/formatRetrievedContext');

/**
 * @param {object|null|undefined} contextPackage
 * @param {{ maxItems?: number, maxChars?: number }} [opts]
 * @returns {{ ctxLine: string, itemCount: number, mode: string|null }}
 */
function buildCtxPromptFragment(contextPackage, opts = {}) {
  const formatted = formatRetrievedContext(contextPackage, {
    maxItems: opts.maxItems || 6,
    maxChars: opts.maxChars || 900,
  });
  if (!formatted.items.length) {
    return { ctxLine: '', itemCount: 0, mode: formatted.mode };
  }
  const payload = formatted.items.map((it) => ({
    sourceId: it.sourceId,
    snippet: it.snippet,
  }));
  return {
    ctxLine: `CTX=${JSON.stringify(payload)}`,
    itemCount: formatted.items.length,
    mode: formatted.mode,
  };
}

function logHowCtx(tag, contextPackage, itemCount) {
  const mode =
    contextPackage?.mode != null
      ? String(contextPackage.mode)
      : contextPackage?.modeUsed != null
        ? String(contextPackage.modeUsed)
        : '-';
  console.info(`[how-ctx] tag=${tag} mode=${mode} items=${itemCount}`);
}

module.exports = {
  buildCtxPromptFragment,
  logHowCtx,
};
