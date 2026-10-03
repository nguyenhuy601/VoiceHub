/**
 * Plan D E5 — flat deploy evidence (no Deployment entity).
 * Client may send notes / pipelineUrl / env; server stamps at + byUserId.
 */
function normalizeDeployEvidence(raw, { userId = null, releaseLabel = '' } = {}) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const envRaw = String(src.env || 'production').trim().toLowerCase().slice(0, 64);
  const env = envRaw || 'production';
  const notes = String(src.notes || '').trim().slice(0, 2000);
  let pipelineUrl = String(src.pipelineUrl || '').trim().slice(0, 500);
  if (pipelineUrl && !/^https?:\/\//i.test(pipelineUrl)) {
    pipelineUrl = '';
  }
  const releaseLabelRef = String(releaseLabel || src.releaseLabelRef || '')
    .trim()
    .slice(0, 64);
  const by =
    userId != null && String(userId).trim()
      ? String(userId).trim()
      : src.byUserId != null
        ? String(src.byUserId).trim()
        : '';
  return {
    at: new Date(),
    byUserId: by || null,
    env,
    releaseLabelRef,
    notes,
    pipelineUrl,
  };
}

module.exports = {
  normalizeDeployEvidence,
};
