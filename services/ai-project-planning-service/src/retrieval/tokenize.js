/**
 * Lightweight tokenizer for G7 keyword retrieve.
 * Ported from project-service evidenceSpanExtract.tokenizeEvidenceText (parity BM25-lite).
 * Do not require project-service (RULE-11).
 */

/**
 * @param {string} text
 * @returns {string[]}
 */
function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

module.exports = { tokenize };
