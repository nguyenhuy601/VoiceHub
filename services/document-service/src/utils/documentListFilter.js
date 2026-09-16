function isValidObjectId(value) {
  return /^[a-fA-F0-9]{24}$/.test(String(value || ''));
}

/**
 * Filter GET /documents — additive projectId, không đổi nghĩa khi thiếu query.
 * @returns {{ filter: object, error?: { statusCode: number, message: string } }}
 */
function buildDocumentListFilter(query = {}, userId = '') {
  const { organizationId, serverId, uploadedBy, tags, isPublic, projectId } = query;
  const filter = { isActive: true };

  if (projectId) {
    if (!isValidObjectId(projectId)) {
      return { filter: null, error: { statusCode: 400, message: 'Invalid projectId' } };
    }
    filter.projectId = String(projectId);
  }

  if (organizationId) {
    if (!isValidObjectId(organizationId)) {
      return { filter: null, error: { statusCode: 400, message: 'Invalid organizationId' } };
    }
    filter.organizationId = String(organizationId);
  }
  if (serverId) {
    if (!isValidObjectId(serverId)) {
      return { filter: null, error: { statusCode: 400, message: 'Invalid serverId' } };
    }
    filter.serverId = String(serverId);
  }
  if (uploadedBy) {
    if (String(uploadedBy) !== String(userId)) {
      return { filter: null, error: { statusCode: 403, message: 'Forbidden' } };
    }
    filter.uploadedBy = String(uploadedBy);
  }
  if (tags) filter.tags = { $in: String(tags).split(',').map((s) => s.trim()).filter(Boolean) };
  if (isPublic !== undefined) filter.isPublic = isPublic === 'true' || isPublic === true;

  if (!organizationId && !serverId && !uploadedBy) {
    filter.uploadedBy = String(userId);
  }

  return { filter };
}

module.exports = { buildDocumentListFilter, isValidObjectId };
