const FIX_SUGGESTION_STATUSES = Object.freeze([
  'none',
  'pending',
  'accepted',
  'rejected',
]);
const FIX_SUGGESTION_DECISIONS = Object.freeze(['accept', 'reject']);

function invalid(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function buildPendingFixSuggestion({ text, userId, now = new Date() } = {}) {
  const normalizedText = String(text || '').trim();
  if (!normalizedText) throw invalid('text là bắt buộc');
  if (normalizedText.length > 4000) throw invalid('text vượt quá 4000 ký tự');
  return {
    status: 'pending',
    text: normalizedText,
    proposedBy: userId || null,
    proposedAt: now,
    decidedBy: null,
    decidedAt: null,
  };
}

function decideFixSuggestion(current, { decision, userId, now = new Date() } = {}) {
  if (String(current?.status || 'none') !== 'pending') {
    throw invalid('Chỉ có thể quyết định fix suggestion đang pending', 409);
  }
  const normalizedDecision = String(decision || '').trim().toLowerCase();
  if (!FIX_SUGGESTION_DECISIONS.includes(normalizedDecision)) {
    throw invalid('decision phải là accept hoặc reject');
  }
  return {
    ...current,
    status: normalizedDecision === 'accept' ? 'accepted' : 'rejected',
    decidedBy: userId || null,
    decidedAt: now,
  };
}

module.exports = {
  FIX_SUGGESTION_STATUSES,
  FIX_SUGGESTION_DECISIONS,
  buildPendingFixSuggestion,
  decideFixSuggestion,
};
