function documentActionUrl({ documentId, organizationId } = {}) {
  const params = new URLSearchParams();
  const oid = String(organizationId || '').trim();
  const did = String(documentId || '').trim();
  if (oid) params.set('organizationId', oid);
  if (did) params.set('documentId', did);
  const qs = params.toString();
  return qs ? `/app/collaborate/documents?${qs}` : '/app/collaborate/documents';
}

module.exports = { documentActionUrl };
