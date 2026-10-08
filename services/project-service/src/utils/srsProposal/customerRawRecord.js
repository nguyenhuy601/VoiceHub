/**
 * CustomerRawRecord SoT (Wave 1) + slim snapshot projection.
 */

/**
 * @param {object} raw
 * @returns {object} CustomerRawRecord
 */
function normalizeCustomerRawRecord(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const documents = Array.isArray(src.documents)
    ? src.documents
    : Array.isArray(src.files)
      ? src.files
      : [];
  return {
    schemaVersion: 1,
    recordId: src.recordId || src.id || null,
    projectId: src.projectId || null,
    packId: src.packId || null,
    intakeAt: src.intakeAt || src.createdAt || new Date().toISOString(),
    documents: documents.map((d, i) => ({
      documentId: String(d.documentId || d.id || `doc-${i + 1}`),
      name: d.name || d.filename || d.title || `document-${i + 1}`,
      mimeType: d.mimeType || d.contentType || null,
      kind: d.kind || d.type || 'workbook',
      sheets: Array.isArray(d.sheets) ? d.sheets : [],
      textBlocks: Array.isArray(d.textBlocks) ? d.textBlocks : [],
      diagnostic: d.diagnostic || null,
    })),
    workbookDiagnostic: src.workbookDiagnostic || null,
    meta: src.meta && typeof src.meta === 'object' ? src.meta : {},
  };
}

/**
 * Slim snapshot for AI — pin ids, drop bulky blobs.
 * @param {object} rawRecord
 * @param {{ functionalRequirements?: object[], actors?: object[], domain?: object, context?: object }} extras
 */
function buildSlimSnapshotFromRawRecord(rawRecord, extras = {}) {
  const rec = normalizeCustomerRawRecord(rawRecord);
  return {
    snapshotId: extras.snapshotId || `snap-${rec.recordId || 'raw'}`,
    packId: rec.packId,
    projectId: rec.projectId,
    functionalRequirements: Array.isArray(extras.functionalRequirements)
      ? extras.functionalRequirements
      : [],
    actors: Array.isArray(extras.actors) ? extras.actors : [],
    domain: extras.domain || {},
    context: {
      ...(extras.context || {}),
      rawRecordId: rec.recordId,
      documentIds: rec.documents.map((d) => d.documentId),
    },
    evidencePack: extras.evidencePack || null,
  };
}

module.exports = {
  normalizeCustomerRawRecord,
  buildSlimSnapshotFromRawRecord,
};
