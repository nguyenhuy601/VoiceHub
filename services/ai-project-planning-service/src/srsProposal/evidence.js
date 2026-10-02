/**
 * Evidence helpers — buildEvidencePack (W2) vs resolveProposalEvidence scoped (W4).
 * RULE-SOURCE-01: documentId + spanId/row only for resolve.
 */

/**
 * @param {{ documents?: object[], spans?: object[], rows?: object[] }} raw
 */
function buildEvidencePack(raw = {}) {
  const documents = Array.isArray(raw.documents) ? raw.documents : [];
  const spans = Array.isArray(raw.spans) ? raw.spans : [];
  const rows = Array.isArray(raw.rows) ? raw.rows : [];
  return {
    documents: documents.map((d) => ({
      documentId: String(d.documentId || d.id || ''),
      title: d.title || d.name || null,
      sourceRole: d.sourceRole || 'primary',
    })),
    spans: spans.map((s) => ({
      spanId: String(s.spanId || s.id || ''),
      documentId: String(s.documentId || ''),
      text: s.text || s.excerpt || '',
      relationType: s.relationType || 'supports',
    })),
    rows: rows.map((r) => ({
      rowId: String(r.rowId || r.id || ''),
      documentId: String(r.documentId || ''),
      sheet: r.sheet || null,
      values: r.values || r.cells || null,
      relationType: r.relationType || 'supports',
    })),
  };
}

/**
 * Scoped resolve — only documentId + spanId OR documentId + rowId.
 * @param {object} evidencePack
 * @param {{ documentId: string, spanId?: string, rowId?: string }} ref
 */
function resolveProposalEvidence(evidencePack, ref = {}) {
  const pack = evidencePack && typeof evidencePack === 'object' ? evidencePack : {};
  const documentId = String(ref.documentId || '').trim();
  if (!documentId) {
    const err = new Error('documentId required');
    err.code = 'EVIDENCE_SCOPE_REQUIRED';
    throw err;
  }
  if (ref.spanId) {
    const span = (pack.spans || []).find(
      (s) => String(s.documentId) === documentId && String(s.spanId) === String(ref.spanId)
    );
    return span || null;
  }
  if (ref.rowId) {
    const row = (pack.rows || []).find(
      (r) => String(r.documentId) === documentId && String(r.rowId) === String(ref.rowId)
    );
    return row || null;
  }
  const err = new Error('spanId or rowId required with documentId');
  err.code = 'EVIDENCE_SCOPE_REQUIRED';
  throw err;
}

module.exports = {
  buildEvidencePack,
  resolveProposalEvidence,
};
