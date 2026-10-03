/**
 * Pure helpers for Phase 2 Manual staging (no mongoose).
 */

const STAGING_STATUSES = new Set([
  'draft',
  'po_review',
  'changes_requested',
  'approved',
  'applied',
]);

function stagingStartDate(value) {
  if (value == null || value === '') return '';
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).trim().slice(0, 10);
}

/**
 * Person and start date shown on the staging table.
 * Reads structured only — PlanningArtifact has no top-level assigneeUserId.
 */
function stagingDisplayFromWbs(artifact) {
  const st =
    artifact?.structured && typeof artifact.structured === 'object' ? artifact.structured : {};
  const assigneeUserId = String(st.assigneeUserId || '').trim();
  return {
    assigneeUserId: assigneeUserId || null,
    assigneeEmail: String(st.assigneeEmail || '').trim().slice(0, 120),
    assigneeName: String(st.assigneeName || '').trim().slice(0, 120),
    startDate: stagingStartDate(st.startDate),
  };
}

const EMPTY_STAGING_DISPLAY = {
  assigneeUserId: null,
  assigneeEmail: '',
  assigneeName: '',
  startDate: '',
};

/** Refresh locked display fields from current WBS. Added rows and missing artifacts stay blank. */
function overlayStagingRowsFromWbs(rows, artifacts) {
  const byId = new Map();
  for (const art of Array.isArray(artifacts) ? artifacts : []) {
    const id = String(art?._id || art?.id || '').trim();
    if (id) byId.set(id, art);
  }
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const id = String(row?.sourceArtifactId || '').trim();
    const art = id ? byId.get(id) : null;
    const display = art ? stagingDisplayFromWbs(art) : EMPTY_STAGING_DISPLAY;
    return { ...row, ...display };
  });
}

/** Hours live on the WBS leaf as structured.effortHours (ước lượng), not estimateHours. */
function leafEstimateHours(artifact) {
  const st =
    artifact?.structured && typeof artifact.structured === 'object' ? artifact.structured : {};
  const raw = artifact?.estimateHours ?? st.estimateHours ?? st.effortHours;
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function whitelistRow(raw, index = 0) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const localId =
    String(r.localId || r.id || '').trim() || `row_${index}_${Date.now().toString(36)}`;
  const changeType = ['from_wbs', 'added', 'edited', 'removed'].includes(
    String(r.changeType || '').toLowerCase()
  )
    ? String(r.changeType).toLowerCase()
    : r.sourceArtifactId
      ? 'from_wbs'
      : 'added';
  const estimateRaw = r.estimateHours ?? r.estimate ?? null;
  let estimateHours = null;
  if (estimateRaw != null && estimateRaw !== '') {
    const n = Number(estimateRaw);
    if (Number.isFinite(n) && n >= 0) estimateHours = n;
  }
  return {
    localId,
    sourceArtifactId: r.sourceArtifactId ? String(r.sourceArtifactId) : null,
    externalKey: String(r.externalKey || r.key || '')
      .trim()
      .slice(0, 64),
    title: String(r.title || '')
      .trim()
      .slice(0, 500),
    estimateHours,
    assigneeUserId: r.assigneeUserId ? String(r.assigneeUserId).trim() : null,
    assigneeEmail: String(r.assigneeEmail || '')
      .trim()
      .slice(0, 120),
    assigneeName: String(r.assigneeName || '')
      .trim()
      .slice(0, 120),
    startDate: stagingStartDate(r.startDate),
    columnHint: String(r.columnHint || '')
      .trim()
      .slice(0, 64),
    changeType,
  };
}

function summarizeStaging(projectLean) {
  const s = projectLean?.phase2ManualStaging;
  if (!s || typeof s !== 'object') return null;
  const status = String(s.status || '');
  if (!STAGING_STATUSES.has(status) && status !== '') return null;
  return {
    status: status || null,
    methodology: s.methodology || null,
    rowCount: Array.isArray(s.rows) ? s.rows.length : 0,
    note: s.note || '',
    reviewNote: s.reviewNote || '',
    submittedAt: s.submittedAt || null,
    submittedBy: s.submittedBy ? String(s.submittedBy) : null,
    reviewedAt: s.reviewedAt || null,
    reviewedBy: s.reviewedBy ? String(s.reviewedBy) : null,
  };
}

function isManualStagingDisabled() {
  return String(process.env.PHASE2_MANUAL_STAGING || '1').trim() === '0';
}

/** Stamp người gửi staging — cổng PO kế tiếp không được cùng userId (kể cả org admin). */
function stagingSubmitterStamp(submittedBy) {
  const id = String(submittedBy || '').trim();
  return id ? [{ userId: id }] : [];
}

module.exports = {
  STAGING_STATUSES,
  stagingDisplayFromWbs,
  overlayStagingRowsFromWbs,
  leafEstimateHours,
  whitelistRow,
  summarizeStaging,
  isManualStagingDisabled,
  stagingSubmitterStamp,
};
