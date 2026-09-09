/**
 * @param {{ organizationId?: string, channelId?: string, projectId?: string, boardId?: string, extractionId?: string }} opts
 */
function buildAiProposalActionUrl(opts = {}) {
  const oid = String(opts.organizationId || '').trim();
  const channelId = String(opts.channelId || '').trim();
  const projectId = String(opts.projectId || '').trim();
  const boardId = String(opts.boardId || '').trim();
  const extractionId = String(opts.extractionId || '').trim();

  if (projectId) {
    const params = new URLSearchParams();
    if (oid) params.set('organizationId', oid);
    if (boardId) params.set('boardId', boardId);
    if (extractionId) params.set('aiExtractionId', extractionId);
    const qs = params.toString();
    return `/app/collaborate/projects/${encodeURIComponent(projectId)}${qs ? `?${qs}` : ''}`;
  }

  if (oid && channelId) {
    const params = new URLSearchParams();
    params.set('channelId', channelId);
    if (extractionId) params.set('aiExtractionId', extractionId);
    return `/app/collaborate/organizations/${encodeURIComponent(oid)}/channels?${params.toString()}`;
  }

  if (oid) {
    return `/app/collaborate/projects?organizationId=${encodeURIComponent(oid)}`;
  }
  return '/app/collaborate/projects';
}

module.exports = { buildAiProposalActionUrl };
