/**
 * Run snapshot pipeline: Resolve → Project → Ingestion quality → Canon → Merge → Common → preparedByJob.
 * Consume path: preparedByJob ids are SoT (materialize); overlay FR recomputes filter; legacy fallback applyJobFilter.
 */

const { PIPELINE_VERSION } = require('./pipelineConstants');
const { resolveSources } = require('./resolveSources');
const { projectAllSources } = require('./fieldProjection');
const { applyIngestionQuality } = require('./ingestionQuality');
const { canonicalizeProjected } = require('./canonicalize');
const { semanticMerge } = require('./semanticMerge');
const { applyCommonFilter } = require('./commonFilter');
const { buildDatasetVersions } = require('./datasetVersions');
const {
  applyJobFilter,
  buildPreparedByJobSummary,
  materializePreparedJob,
} = require('./jobFilters');
const { splitContext } = require('./splitContext');
const { projectSnapshotForJob } = require('./jobProjectionProfiles');
const { hashFunctionalRequirements } = require('../../requirement/workbookDiagnostic');
const {
  REQUIRED_PROJECTED_SRS_SECTIONS,
} = require('./projectAnalysisSections');

/**
 * Build immutable snapshot body from live pack + pool + calendar (called once at create).
 */
function buildSnapshotPayload({
  pack,
  poolItems = [],
  calendar = {},
  skillCatalog = {},
  packContentHash,
  packStatus,
} = {}) {
  const sourcesResolved = resolveSources();
  let projected = projectAllSources({ pack, poolItems, calendar, skillCatalog });
  const ingestion = applyIngestionQuality(projected);
  projected = ingestion.projected;

  const canonical = canonicalizeProjected(projected);
  const merged = semanticMerge(canonical);
  const commonFiltered = applyCommonFilter(canonical, merged, { packStatus });
  const preparedByJob = buildPreparedByJobSummary(commonFiltered);
  const frRows = projected?.srs?.functionalRequirements || [];
  ingestion.validation = {
    ...(ingestion.validation || {}),
    functionalRequirementCount: frRows.length,
    functionalRequirementHash: hashFunctionalRequirements(frRows),
  };
  const versions = buildDatasetVersions({
    packVersionNumber: pack?.versionNumber,
    packContentHash,
    projectedEmployees: projected.employees,
    skillCatalogVersion: projected.skillCatalog?.version,
    calendar: projected.calendar,
  });

  return {
    packContentHash: String(packContentHash || ''),
    packVersionNumber: Number(pack?.versionNumber) || 1,
    templateVersion: String(pack?.templateVersion || ''),
    versions,
    sourcesResolved,
    projected,
    canonical,
    merged,
    commonFiltered,
    preparedByJob,
    ingestionValidation: ingestion.validation,
    pipelineVersion: PIPELINE_VERSION,
  };
}

function resolveCommonBase(snapshot) {
  if (snapshot?.commonFiltered) {
    return { ...snapshot.commonFiltered };
  }
  return applyCommonFilter(
    snapshot?.canonical || canonicalizeProjected(snapshot?.projected || {}),
    snapshot?.merged || {},
    {}
  );
}

/**
 * Per-job view from an existing snapshot document (lean).
 * Happy path: materialize from preparedByJob (no re-applyJobFilter).
 * Overlay FR: recompute FR filter; pin employees from prepared when present.
 * Legacy: no prepared → applyJobFilter.
 */
function buildJobInputFromSnapshot(snapshot, job, { overlayFrList } = {}) {
  const key = String(job || '').trim();
  const preparedSummary = snapshot?.preparedByJob?.[key] || null;
  let common = resolveCommonBase(snapshot);
  const hasOverlay = Array.isArray(overlayFrList) && overlayFrList.length > 0;

  if (hasOverlay) {
    const { projectFrNode } = require('./fieldProjection');
    const { canonicalizeProjected: canon } = require('./canonicalize');
    const overlayProjected = {
      ...(snapshot.projected || {}),
      srs: {
        ...(snapshot.projected?.srs || {}),
        functionalRequirements: overlayFrList.map(projectFrNode).filter(Boolean),
      },
    };
    const overlayCanonical = canon(overlayProjected);
    const overlayMerged = require('./semanticMerge').semanticMerge(overlayCanonical);
    const overlayCommon = applyCommonFilter(overlayCanonical, overlayMerged, {});
    Object.assign(common, overlayCommon, {
      employees: common.employees,
      calendar: common.calendar,
      skillCatalog: common.skillCatalog,
    });
  }

  let jobFiltered;
  if (hasOverlay) {
    jobFiltered = applyJobFilter(key, common);
    // Pin matching/schedule pool to prepared employee ids when available
    if (preparedSummary && Array.isArray(preparedSummary.employeeIds) && preparedSummary.employeeIds.length) {
      const pinned = materializePreparedJob(common, preparedSummary, key);
      if (pinned && Array.isArray(pinned.employees)) {
        jobFiltered = {
          ...jobFiltered,
          employees: pinned.employees,
          filterMeta: {
            ...(jobFiltered.filterMeta || {}),
            employeesFromPrepared: true,
            employeeKept: pinned.employees.length,
          },
        };
      }
    }
  } else if (preparedSummary) {
    jobFiltered = materializePreparedJob(common, preparedSummary, key);
    if (!jobFiltered) {
      jobFiltered = applyJobFilter(key, common);
    }
  } else {
    jobFiltered = applyJobFilter(key, common);
  }

  const projectedForJob = projectSnapshotForJob(snapshot?.projected || {}, key);
  const split = splitContext(key, jobFiltered, {
    snapshotId: String(snapshot?._id || snapshot?.id || ''),
  });

  return {
    jobFiltered,
    projectedForJob,
    preparedSummary,
    ...split,
    versions: snapshot?.versions || null,
    snapshotId: String(snapshot?._id || snapshot?.id || ''),
  };
}

function sliceFrList(frList, allowedIds) {
  if (!allowedIds || !allowedIds.size) return frList;
  return (frList || []).filter((r) => allowedIds.has(String(r.externalId || r.id || '').trim()));
}

/**
 * Legacy helper — kept for unit tests; analysis-freeze must NOT use live overflow (RULE-DL-02).
 */
function preferNonEmpty(snapArr, liveArr) {
  const s = Array.isArray(snapArr) ? snapArr : null;
  const l = Array.isArray(liveArr) ? liveArr : [];
  if (s && s.length > 0) return s;
  if (l.length > 0) return l;
  return s || l || [];
}

function arrayOrEmpty(v) {
  return Array.isArray(v) ? v : [];
}

/**
 * Analysis-freeze pack-shaped view from snapshot only (RULE-DL-02).
 * Not a full Pack clone — overview + engine sections + HOW planning slices from projected.
 */
function buildPackObjectFromSnapshot(
  livePack,
  snapshot,
  { overlayFrList, job, jobFiltered } = {}
) {
  const packObj =
    livePack && typeof livePack.toObject === 'function'
      ? livePack.toObject()
      : { ...(livePack || {}) };
  const projected = snapshot?.projected && typeof snapshot.projected === 'object'
    ? snapshot.projected
    : {};
  const srs = projected.srs && typeof projected.srs === 'object' ? projected.srs : {};

  const key = String(job || '').trim();
  const prepared = key ? snapshot?.preparedByJob?.[key] : null;

  let frSource = Array.isArray(overlayFrList) && overlayFrList.length
    ? overlayFrList
    : arrayOrEmpty(srs.functionalRequirements);

  const frIdSet = new Set();
  if (Array.isArray(jobFiltered?.fr) && jobFiltered.fr.length) {
    for (const r of jobFiltered.fr) {
      const id = String(r.externalId || '').trim();
      if (id) frIdSet.add(id);
    }
  } else if (Array.isArray(prepared?.frIds) && prepared.frIds.length) {
    for (const id of prepared.frIds) {
      const s = String(id || '').trim();
      if (s) frIdSet.add(s);
    }
  }

  if (frIdSet.size && !(Array.isArray(overlayFrList) && overlayFrList.length)) {
    frSource = sliceFrList(frSource, frIdSet);
  } else if (frIdSet.size && Array.isArray(overlayFrList) && overlayFrList.length) {
    if (Array.isArray(jobFiltered?.fr) && jobFiltered.fr.length) {
      frSource = jobFiltered.fr;
    } else {
      frSource = sliceFrList(frSource, frIdSet);
    }
  }

  let nfr = arrayOrEmpty(srs.nonFunctionalRequirements);
  if (Array.isArray(jobFiltered?.nonFunctionalRequirements) && jobFiltered.nonFunctionalRequirements.length) {
    nfr = jobFiltered.nonFunctionalRequirements;
  } else if (prepared?.nfrCount != null && Number.isFinite(Number(prepared.nfrCount))) {
    nfr = nfr.slice(0, Number(prepared.nfrCount));
  }

  const entities = arrayOrEmpty(srs.entities);

  const freeze = {
    _id: packObj._id,
    packId: packObj._id != null ? String(packObj._id) : packObj.packId,
    organizationId: packObj.organizationId,
    projectId: packObj.projectId,
    versionNumber: Number(srs.versionNumber || packObj.versionNumber) || 1,
    templateVersion: String(srs.templateVersion || packObj.templateVersion || ''),
    status: packObj.status,
    approvedSrsVersion: packObj.approvedSrsVersion || null,
    overview: {
      requirementName: srs.overview?.name || srs.overview?.requirementName || '',
      projectObjective: srs.overview?.objective || srs.overview?.projectObjective || '',
      platform: srs.overview?.platform,
      priority: srs.overview?.priority,
      startDate: srs.overview?.startDate || null,
      deadline: srs.overview?.deadline || null,
      businessScope: srs.overview?.businessScope || '',
    },
    functionalRequirements: frSource,
    nonFunctionalRequirements: nfr,
    businessGoals: arrayOrEmpty(srs.businessGoals),
    businessRules: arrayOrEmpty(srs.businessRules),
    scope: arrayOrEmpty(srs.scope),
    businessProcesses: arrayOrEmpty(srs.businessProcesses),
    processes: arrayOrEmpty(srs.businessProcesses),
    interfaces: arrayOrEmpty(srs.interfaces),
    useCases: arrayOrEmpty(srs.useCases),
    entities,
    domainEntities: entities,
    dataEntities: entities,
    glossary: arrayOrEmpty(srs.glossary),
    glossaryTerms: arrayOrEmpty(srs.glossary),
    assumptions: arrayOrEmpty(srs.assumptions),
    staffingPlan: {
      ...(srs.staffingPlan || {}),
    },
    technology: arrayOrEmpty(srs.technology),
    requirementSkills: arrayOrEmpty(srs.requirementSkills),
    // HOW planning slices — from projected, not live Mongo
    employees: arrayOrEmpty(projected.employees),
    skillCatalog: projected.skillCatalog || { skills: [] },
    calendar: projected.calendar || { workingCalendar: {}, holidays: [] },
  };

  // Ensure every required section key exists even if older partial srs
  for (const section of REQUIRED_PROJECTED_SRS_SECTIONS) {
    if (section === 'functionalRequirements') {
      freeze.functionalRequirements = arrayOrEmpty(freeze.functionalRequirements);
    } else if (section === 'nonFunctionalRequirements') {
      freeze.nonFunctionalRequirements = arrayOrEmpty(freeze.nonFunctionalRequirements);
    } else if (section === 'entities') {
      freeze.entities = arrayOrEmpty(freeze.entities);
      freeze.domainEntities = freeze.entities;
      freeze.dataEntities = freeze.entities;
    } else if (!(section in freeze) || !Array.isArray(freeze[section])) {
      freeze[section] = [];
    }
  }

  return freeze;
}

module.exports = {
  buildSnapshotPayload,
  buildJobInputFromSnapshot,
  buildPackObjectFromSnapshot,
  preferNonEmpty,
};
