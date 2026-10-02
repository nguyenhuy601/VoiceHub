/**
 * Aggregate per-workbook prefillWorkbook results into one pack payload.
 * RULE-DUP-01 / RULE-AGG-01 / RULE-FILE-01 / RULE-DIAG-01.
 */

const { normId, normProse } = require('./requirementTemplateTextNorm');
const {
  emptyWorkbookDiagnostic,
} = require('./workbookDiagnostic');
const { emptyCustomerRawRows } = require('./workbookCompanionExtract');

function mergeOverview(existing = {}, fromRaw = {}) {
  const next = { ...(existing || {}) };
  const map = {
    requirementName: fromRaw.projectName || fromRaw.requirementName,
    projectObjective: fromRaw.projectObjective,
    businessScope: fromRaw.businessScope || fromRaw.businessDescription,
    expectedUsers: fromRaw.targetUsers || fromRaw.expectedUsers,
    expectedScale: fromRaw.expectedScale,
    platform: fromRaw.targetPlatform || fromRaw.platform,
    priority: fromRaw.priority,
    deadline: fromRaw.deadline,
    budget: fromRaw.budget,
  };
  for (const [key, value] of Object.entries(map)) {
    const v = normProse(value || '');
    if (!v) continue;
    if (!String(next[key] || '').trim()) next[key] = v;
  }
  return next;
}

function createdAtMs(value) {
  if (value == null) return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const t = Date.parse(String(value));
  return Number.isFinite(t) ? t : 0;
}

function documentIdKey(value) {
  return String(value || '');
}

/**
 * sortKey = [createdAt ASC, documentId ASC]
 */
function compareWorkbookMeta(a, b) {
  const ca = createdAtMs(a.createdAt);
  const cb = createdAtMs(b.createdAt);
  if (ca !== cb) return ca - cb;
  return documentIdKey(a.documentId).localeCompare(documentIdKey(b.documentId));
}

function sheetRowKey(row) {
  const sheet = String(row?.sheet || '');
  const rowNum = Number(row?.row) || 0;
  return `${sheet}\0${String(rowNum).padStart(10, '0')}`;
}

/**
 * Keep first occurrence of externalId by sortKey (file order already applied).
 * Within a file, keep sheet ASC then row ASC for customerRawRows.
 */
function mergeByExternalIdFirst(existing, incoming) {
  const list = Array.isArray(existing) ? [...existing] : [];
  const seen = new Set(list.map((r) => normId(r.externalId || r.externalKey)).filter(Boolean));
  for (const row of Array.isArray(incoming) ? incoming : []) {
    const id = normId(row.externalId || row.externalKey);
    if (!id) continue;
    if (seen.has(id)) continue;
    list.push({ ...row });
    seen.add(id);
  }
  return list;
}

function sortRawRows(rows) {
  return [...(Array.isArray(rows) ? rows : [])].sort((a, b) => {
    const sa = String(a.sheet || '');
    const sb = String(b.sheet || '');
    if (sa !== sb) return sa.localeCompare(sb);
    return (Number(a.row) || 0) - (Number(b.row) || 0);
  });
}

function mergeCustomerRawRows(target, incoming) {
  const next = {
    businessRequests: mergeByExternalIdFirst(
      target.businessRequests,
      sortRawRows(incoming?.businessRequests)
    ),
    references: mergeByExternalIdFirst(
      target.references,
      sortRawRows(incoming?.references)
    ),
    requirementSources: mergeByExternalIdFirst(
      target.requirementSources,
      sortRawRows(incoming?.requirementSources)
    ),
  };
  return next;
}

function perFileSummary(result) {
  const diagnostic = result?.workbookDiagnostic || null;
  const status = diagnostic?.status
    || (result?.meta?.applied ? 'NOT_READY' : 'FAILED');
  return {
    documentId: result?.meta?.documentId || null,
    filename: result?.meta?.filename || diagnostic?.workbook?.fileName || null,
    status,
    validFr: Number(diagnostic?.rows?.validFr) || (result?.functionalRequirements || []).length || 0,
    reasonCodes: Array.isArray(diagnostic?.reasonCodes) ? [...diagnostic.reasonCodes] : [],
    mappingFailure: diagnostic?.mappingDiagnostic?.failureReason || null,
    source: result?.meta?.source || null,
    intakeKind: result?.meta?.intakeKind || diagnostic?.intakeKind || null,
  };
}

/**
 * RULE-AGG-01:
 * all FAILED → FAILED
 * else total validFr === 0 → NOT_READY
 * else every SUCCESS → SUCCESS
 * else → PARTIAL
 */
function computeAggregateStatus(fileSummaries, totalValidFr) {
  const list = Array.isArray(fileSummaries) ? fileSummaries : [];
  if (!list.length) return 'NOT_READY';
  if (list.every((f) => f.status === 'FAILED')) return 'FAILED';
  if (!(Number(totalValidFr) > 0)) return 'NOT_READY';
  if (list.every((f) => f.status === 'SUCCESS')) return 'SUCCESS';
  return 'PARTIAL';
}

function buildAggregateDiagnostic({
  fileSummaries,
  status,
  functionalRequirements,
  frSourceMap,
  reasonCodes,
}) {
  const diagnostic = emptyWorkbookDiagnostic();
  diagnostic.status = status;
  diagnostic.reasonCodes = Array.isArray(reasonCodes) ? [...new Set(reasonCodes)] : [];
  diagnostic.rows.validFr = Array.isArray(functionalRequirements)
    ? functionalRequirements.length
    : 0;
  diagnostic.frSourceMap = Array.isArray(frSourceMap) ? frSourceMap : [];
  if (status === 'SUCCESS' || status === 'PARTIAL') {
    diagnostic.mappingDiagnostic = {
      status: 'COMPLETE',
      required: ['id', 'requirement'],
      mapped: ['id', 'requirement'],
      missing: [],
      candidates: [],
    };
    if (Array.isArray(frSourceMap) && frSourceMap.length) {
      diagnostic.tableSelection.selectedHeaderRow = 1;
      diagnostic.sheetSelection.selected = frSourceMap[0].sheet;
    }
  }
  if (status === 'FAILED' && !diagnostic.reasonCodes.length) {
    diagnostic.reasonCodes = ['PARSER_ERROR'];
    diagnostic.error = { code: 'PARSER_ERROR', message: 'All workbooks failed' };
  }
  diagnostic.fileCount = fileSummaries.length;
  diagnostic.fileStatuses = fileSummaries.map((f) => ({
    documentId: f.documentId,
    filename: f.filename,
    status: f.status,
    validFr: f.validFr,
  }));
  return diagnostic;
}

/**
 * @param {Array<{
 *   functionalRequirements?: object[],
 *   nonFunctionalRequirements?: object[],
 *   customerRawRows?: object,
 *   workbookDiagnostic?: object,
 *   overview?: object,
 *   scope?: object[],
 *   businessGoals?: object[],
 *   businessRules?: object[],
 *   businessProcesses?: object[],
 *   useCases?: object[],
 *   meta?: { documentId?: string, filename?: string, createdAt?: *, applied?: boolean },
 * }>} results — already one result per workbook; will be sorted in place copy
 */
function aggregateWorkbookResults(results = []) {
  const ordered = [...(Array.isArray(results) ? results : [])].sort((a, b) =>
    compareWorkbookMeta(a.meta || {}, b.meta || {})
  );

  let functionalRequirements = [];
  let nonFunctionalRequirements = [];
  let customerRawRows = emptyCustomerRawRows();
  let overview = {};
  let scope = [];
  let businessGoals = [];
  let businessRules = [];
  let businessProcesses = [];
  let useCases = [];
  const frSourceMap = [];
  const reasonCodes = [];
  const workbookDiagnostics = [];

  for (const result of ordered) {
    const summary = perFileSummary(result);
    workbookDiagnostics.push(summary);

    const diag = result.workbookDiagnostic;
    if (diag?.status === 'FAILED' || diag?.status === 'NOT_READY') {
      if (Array.isArray(diag.reasonCodes)) reasonCodes.push(...diag.reasonCodes);
      // RULE-FILE-01: do not wipe FR already accepted from earlier files
    }

    // Always merge FR/NFR from this file (dup rule keeps first)
    functionalRequirements = mergeByExternalIdFirst(
      functionalRequirements,
      result.functionalRequirements
    );
    nonFunctionalRequirements = mergeByExternalIdFirst(
      nonFunctionalRequirements,
      result.nonFunctionalRequirements
    );
    customerRawRows = mergeCustomerRawRows(customerRawRows, result.customerRawRows);

    if (Array.isArray(diag?.frSourceMap)) {
      for (const loc of diag.frSourceMap) {
        const id = normId(loc.externalId);
        if (!id) continue;
        if (frSourceMap.some((x) => normId(x.externalId) === id)) continue;
        frSourceMap.push({
          externalId: id,
          sheet: loc.sheet,
          row: loc.row,
        });
      }
    }

    overview = mergeOverview(overview, result.overview || {});
    if ((!scope || !scope.length) && Array.isArray(result.scope) && result.scope.length) {
      scope = result.scope;
    }
    businessGoals = mergeByExternalIdFirst(businessGoals, result.businessGoals);
    businessRules = mergeByExternalIdFirst(businessRules, result.businessRules);
    businessProcesses = mergeByExternalIdFirst(businessProcesses, result.businessProcesses);
    useCases = mergeByExternalIdFirst(useCases, result.useCases);

    if (Array.isArray(diag?.reasonCodes) && (diag.status === 'PARTIAL' || diag.status === 'SUCCESS')) {
      reasonCodes.push(...diag.reasonCodes.filter((c) =>
        ['INVALID_ROWS', 'MISSING_REQUIRED_ID', 'DUPLICATE_ID'].includes(c)
      ));
    }
  }

  const totalValidFr = functionalRequirements.length;
  const status = computeAggregateStatus(workbookDiagnostics, totalValidFr);
  const workbookDiagnostic = buildAggregateDiagnostic({
    fileSummaries: workbookDiagnostics,
    status,
    functionalRequirements,
    frSourceMap,
    reasonCodes,
  });
  if (workbookDiagnostics.some((f) => f.intakeKind === 'customer_raw' || f.source === 'customer_raw')) {
    workbookDiagnostic.intakeKind = 'customer_raw';
  }

  return {
    functionalRequirements,
    nonFunctionalRequirements,
    customerRawRows,
    overview,
    scope,
    businessGoals,
    businessRules,
    businessProcesses,
    useCases,
    workbookDiagnostic,
    workbookDiagnostics,
    meta: {
      fileCount: workbookDiagnostics.length,
      aggregateStatus: status,
      validFr: totalValidFr,
      nfrCount: nonFunctionalRequirements.length,
      businessRequestCount: customerRawRows.businessRequests.length,
      referenceCount: customerRawRows.references.length,
    },
  };
}

module.exports = {
  compareWorkbookMeta,
  computeAggregateStatus,
  mergeByExternalIdFirst,
  aggregateWorkbookResults,
  sheetRowKey,
  createdAtMs,
};
