const crypto = require('crypto');

/**
 * MinIO key prefix for Phase 1 Import Set files (SC-4).
 */
function buildImportSetObjectKey({ projectId, setId, slot, fileName, nowMs = Date.now() }) {
  const safeName = String(fileName || 'file.xlsx')
    .replace(/[^\w.\-()+ ]/g, '_')
    .slice(0, 120);
  return `projects/${String(projectId)}/import-sets/${String(setId)}/${slot}/${nowMs}-${safeName}`;
}

function sha256Hex(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

module.exports = {
  buildImportSetObjectKey,
  sha256Hex,
};
