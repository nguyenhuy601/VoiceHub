/**
 * DTO công khai cho Organization — không trả provisioning nội bộ / lỗi seed.
 */
function toPublicOrganization(doc, extra = {}) {
  if (!doc) return null;
  const o = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  const provisioning = o.provisioning && typeof o.provisioning === 'object' ? o.provisioning : {};
  const structure = provisioning.structure && typeof provisioning.structure === 'object'
    ? provisioning.structure
    : {};

  return {
    _id: o._id,
    id: o._id,
    name: o.name,
    description: o.description || '',
    logo: o.logo || null,
    slug: o.slug || '',
    status: o.status || 'ACTIVE',
    type: o.type || '',
    teamSize: o.teamSize || '',
    industry: o.industry || '',
    ownerId: o.ownerId,
    isActive: o.isActive !== false,
    settings: o.settings || {},
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    provisioning: {
      structure: {
        status: structure.status || null,
        completedAt: structure.completedAt || null,
      },
    },
    ...extra,
  };
}

function toJoinApplicationListItem(row) {
  if (!row) return null;
  const snapshot = row.applicantSnapshot && typeof row.applicantSnapshot === 'object'
    ? row.applicantSnapshot
    : {};
  return {
    _id: row._id,
    id: row._id,
    organization: String(row.organization),
    applicantUser: String(row.applicantUser),
    applicantSnapshot: {
      userId: String(snapshot.userId || row.applicantUser || ''),
      username: String(snapshot.username || '').trim(),
      fullName: String(snapshot.fullName || '').trim(),
      email: String(snapshot.email || '').trim(),
      avatar: String(snapshot.avatar || '').trim(),
    },
    answers: row.answers || {},
    formSnapshot: row.formSnapshot ?? null,
    submittedAt: row.submittedAt,
    status: row.status,
    reviewedAt: row.reviewedAt || null,
    reviewedBy: row.reviewedBy ? String(row.reviewedBy) : null,
    rejectionReason: row.rejectionReason || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

module.exports = {
  toPublicOrganization,
  toJoinApplicationListItem,
};
