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
 * Pack-shaped view for LLM/engine jobs from frozen snapshot (+ optional FR overlay).
 * Restricts FR/NFR to jobFiltered / prepared SoT when provided.
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
  const srs = snapshot?.projected?.srs;
  if (!srs) return packObj;

  const key = String(job || '').trim();
  const prepared = key ? snapshot?.preparedByJob?.[key] : null;

  let frSource =
    Array.isArray(overlayFrList) && overlayFrList.length
      ? overlayFrList
      : srs.functionalRequirements || packObj.functionalRequirements;

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
    // Overlay path: prefer jobFiltered FR order/ids when present
    if (Array.isArray(jobFiltered?.fr) && jobFiltered.fr.length) {
      frSource = jobFiltered.fr;
    } else {
      frSource = sliceFrList(frSource, frIdSet);
    }
  }

  let nfr =
    srs.nonFunctionalRequirements || packObj.nonFunctionalRequirements || [];
  if (Array.isArray(jobFiltered?.nonFunctionalRequirements)) {
    nfr = jobFiltered.nonFunctionalRequirements;
  } else if (prepared?.nfrCount != null && Number.isFinite(Number(prepared.nfrCount))) {
    nfr = (nfr || []).slice(0, Number(prepared.nfrCount));
  }

  return {
    ...packObj,
    overview: {
      ...(packObj.overview || {}),
      requirementName: srs.overview?.name || packObj.overview?.requirementName,
      projectObjective: srs.overview?.objective || packObj.overview?.projectObjective,
      platform: srs.overview?.platform || packObj.overview?.platform,
      priority: srs.overview?.priority || packObj.overview?.priority,
      startDate: srs.overview?.startDate || packObj.overview?.startDate,
      deadline: srs.overview?.deadline || packObj.overview?.deadline,
      businessScope: srs.overview?.businessScope || packObj.overview?.businessScope,
    },
    functionalRequirements: frSource,
    nonFunctionalRequirements: nfr,
    staffingPlan: {
      ...(packObj.staffingPlan || {}),
      ...(srs.staffingPlan || {}),
    },
    technology: srs.technology || packObj.technology,
    requirementSkills: srs.requirementSkills || packObj.requirementSkills,
  };
}

module.exports = {
  buildSnapshotPayload,
  buildJobInputFromSnapshot,
  buildPackObjectFromSnapshot,
};
