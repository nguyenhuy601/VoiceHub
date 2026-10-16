/**
 * BM25-lite keyword score for org message search (in-batch re-rank).
 * Pure / deterministic — no I/O. Does not change pageToken cursor (createdAt+_id).
 */

function isMessageSearchRankEnabled() {
  const raw = String(process.env.MESSAGE_SEARCH_RANK || 'on').trim().toLowerCase();
  return raw !== 'off' && raw !== 'false' && raw !== '0' && raw !== 'no';
}

/**
 * Tokenize for keyword match (Unicode letters/numbers — hỗ trợ tiếng Việt).
 * @param {string} text
 * @returns {string[]}
 */
function tokenizeMessageText(text) {
  const s = String(text || '')
    .toLowerCase()
    .normalize('NFC');
  if (!s) return [];
  return s.split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 0);
}

/**
 * BM25-lite: average of (1 + ln(1+tf)) over query tokens present in document.
 * @param {string[]} queryTokens
 * @param {string} documentText
 * @returns {number}
 */
function scoreMessageText(queryTokens, documentText) {
  if (!Array.isArray(queryTokens) || queryTokens.length === 0) return 0;
  const tokens = tokenizeMessageText(documentText);
  if (!tokens.length) return 0;
  const tf = new Map();
  for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
  let score = 0;
  for (const q of queryTokens) {
    const f = tf.get(q) || 0;
    if (f > 0) score += 1 + Math.log(1 + f);
  }
  return score / queryTokens.length;
}

function messageCreatedAtMs(msg) {
  const t = new Date(msg?.createdAt || 0).getTime();
  return Number.isFinite(t) ? t : 0;
}

function messageIdStr(msg) {
  return String(msg?._id || msg?.id || '');
}

/**
 * Re-rank messages in the current batch by keyword score (desc), then createdAt, then id.
 * When rank disabled or no query — returns input unchanged (same reference if no work).
 * @param {object[]} messages — client DTOs or lean docs with content
 * @param {string} queryText — q and/or mention combined
 * @param {{ getContent?: (m: object) => string }} [opts]
 * @returns {object[]}
 */
function rankMessagesByKeyword(messages, queryText, opts = {}) {
  if (!isMessageSearchRankEnabled()) return messages;
  const q = String(queryText || '').trim();
  if (!q) return messages;
  const list = Array.isArray(messages) ? messages : [];
  if (list.length <= 1) return list;

  const queryTokens = tokenizeMessageText(q);
  if (!queryTokens.length) return list;

  const getContent =
    typeof opts.getContent === 'function'
      ? opts.getContent
      : (m) => String(m?.content || '');

  const scored = list.map((m, idx) => ({
    m,
    idx,
    score: scoreMessageText(queryTokens, getContent(m)),
  }));
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const tb = messageCreatedAtMs(b.m);
    const ta = messageCreatedAtMs(a.m);
    if (tb !== ta) return tb - ta;
    const idCmp = messageIdStr(b.m).localeCompare(messageIdStr(a.m));
    if (idCmp !== 0) return idCmp;
    return a.idx - b.idx;
  });
  return scored.map((x) => x.m);
}

module.exports = {
  isMessageSearchRankEnabled,
  tokenizeMessageText,
  scoreMessageText,
  rankMessagesByKeyword,
};
