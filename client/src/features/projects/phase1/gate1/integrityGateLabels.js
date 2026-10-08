/**
 * Requirement Integrity Gate UI labels (RULE-RIG).
 */

export function normalizeIntegrityBlockKind(item = {}) {
  const raw = String(item.blockKind || '').toLowerCase();
  if (raw === 'data_integrity' || raw === 'relationship_integrity') return raw;
  if (raw === 'ambiguity' || String(item.kind || '') === 'incomplete_fields') {
    return 'data_integrity';
  }
  if (
    raw === 'conflict' ||
    String(item.code || '').startsWith('REL_') ||
    String(item.kind || '').includes('relationship')
  ) {
    return 'relationship_integrity';
  }
  if (String(item.kind || '') === 'incomplete_fields') return 'data_integrity';
  return raw || 'data_integrity';
}

export function integrityRowLabelKey(blockKind) {
  if (blockKind === 'relationship_integrity') {
    return 'requirements.phase1Gate1RowRelIntegrity';
  }
  return 'requirements.phase1Gate1RowMissingFields';
}

export function integrityRowLabelFallback(blockKind) {
  if (blockKind === 'relationship_integrity') return 'Relationship integrity';
  return 'Missing fields';
}

export function formatMissingFieldsSuffix(issue) {
  const missing = Array.isArray(issue?.missing) ? issue.missing.filter(Boolean) : [];
  if (missing.length) return missing.join(', ');
  return issue?.message || issue?.kind || '';
}
