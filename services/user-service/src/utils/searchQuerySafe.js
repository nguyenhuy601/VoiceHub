/** Escape user search input for RegExp; cap length to limit ReDoS / abuse. */
const SEARCH_QUERY_MAX_LEN = 64;

function sanitizeSearchQuery(query, maxLen = SEARCH_QUERY_MAX_LEN) {
  const raw = String(query || '').trim().slice(0, Math.max(0, maxLen));
  const escaped = raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return { raw, escaped };
}

module.exports = {
  SEARCH_QUERY_MAX_LEN,
  sanitizeSearchQuery,
};
