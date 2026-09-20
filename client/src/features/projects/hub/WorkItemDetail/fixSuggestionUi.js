/**
 * Pure helpers for Fix Suggestion panel (WorkItemDetail).
 */
function normalizeFixSuggestion(raw) {
  if (!raw || typeof raw !== 'object') {
    return { status: 'none', text: '' };
  }
  const status = String(raw.status || 'none').toLowerCase();
  return {
    status: ['none', 'pending', 'accepted', 'rejected'].includes(status) ? status : 'none',
    text: String(raw.text || '').trim(),
  };
}

function canProposeFixSuggestion(status, canEdit) {
  return Boolean(canEdit) && (status === 'none' || status === 'rejected');
}

function canDecideFixSuggestion(status, canEdit) {
  return Boolean(canEdit) && status === 'pending';
}

module.exports = {
  normalizeFixSuggestion,
  canProposeFixSuggestion,
  canDecideFixSuggestion,
};
