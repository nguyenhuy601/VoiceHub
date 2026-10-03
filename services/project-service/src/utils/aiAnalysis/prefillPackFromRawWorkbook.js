/**
 * Prefill from one Excel buffer.
 * RULE-PREFILL-01: prefillWorkbook is pure per-file — no pack mutate, no multi-file merge.
 */

const {
  parseCustomerRawContext,
  peekCustomerRawTemplateType,
} = require('../requirement/customerRawContextParse');
const { CUSTOMER_RAW_TEMPLATE_TYPE } = require('../../constants/customerRawTemplate.constants');
const { parseRequirementWorkbook } = require('../requirement/requirementTemplateParse');
const { normId, normProse } = require('../requirement/requirementTemplateTextNorm');
const { extractWorkbookFr } = require('../requirement/workbookFrExtract');
const {
  extractWorkbookCompanion,
  emptyCustomerRawRows,
} = require('../requirement/workbookCompanionExtract');
const { failedDiagnostic } = require('../requirement/workbookDiagnostic');
const {
  buildSectionInput,
  frSectionToPackRows,
  nfrSectionToPackRows,
} = require('../requirement/sectionInputContract');
const { clampOverviewForPack } = require('../requirement/requirementOverviewClamp');

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
    if (key === 'platform') {
      if (!Array.isArray(next.platform) || !next.platform.length) next.platform = v;
      continue;
    }
    if (key === 'budget') {
      if (next.budget == null || next.budget === '') next.budget = v;
      continue;
    }
    if (!String(next[key] || '').trim()) next[key] = v;
  }
  return clampOverviewForPack(next);
}

function mergeByExternalId(existingList, incomingList) {
  const list = Array.isArray(existingList) ? existingList.map((r) => ({ ...r })) : [];
  const byId = new Map(list.map((r) => [normId(r.externalId || r.externalKey), r]));
  for (const row of Array.isArray(incomingList) ? incomingList : []) {
    const id = normId(row.externalId || row.externalKey);
    if (!id) continue;
    if (byId.has(id)) continue;
    list.push({ ...row });
    byId.set(id, row);
  }
  return list;
}

function scopeFromContext(ctx = {}) {
  const scope = [];
  if (ctx.inScope) scope.push({ type: 'in', scopeType: 'in', description: ctx.inScope });
  if (ctx.outOfScope) {
    scope.push({ type: 'out', scopeType: 'out', description: ctx.outOfScope });
  }
  if (!scope.length && ctx.businessScope) {
    scope.push({ type: 'in', scopeType: 'in', description: ctx.businessScope });
  }
  return scope;
}

/** Deterministic scope from Section Input (prefer over ad-hoc context keys). */
function scopeFromCanonicalRaw(canonicalRaw) {
  if (!canonicalRaw) return [];
  const section = buildSectionInput('scope', canonicalRaw);
  return (section.items || []).map((row) => ({
    type: row.type || 'in',
    scopeType: row.type || 'in',
    description: row.description || '',
  }));
}

function emptyResult(meta = {}) {
  return {
    functionalRequirements: [],
    nonFunctionalRequirements: [],
    customerRawRows: emptyCustomerRawRows(),
    workbookDiagnostic: null,
    overview: {},
    scope: [],
    meta: {
      applied: false,
      source: 'none',
      ...meta,
    },
  };
}

/**
 * Pure per-workbook extract. Does not read or write a pack.
 *
 * @param {Buffer} buffer
 * @param {{ filename?: string, documentId?: string }} [metadata]
 * @returns {{
 *   functionalRequirements: object[],
 *   nonFunctionalRequirements: object[],
 *   customerRawRows: object,
 *   workbookDiagnostic: object|null,
 *   overview: object,
 *   scope: object[],
 *   meta: object,
 * }}
 */
function prefillWorkbook(buffer, metadata = {}) {
  const filename = metadata.filename ? String(metadata.filename).slice(0, 260) : undefined;
  const documentId = metadata.documentId != null ? String(metadata.documentId) : undefined;

  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    return emptyResult({
      reason: 'empty_buffer',
      filename,
      documentId,
    });
  }

  const frExtracted = extractWorkbookFr(buffer, { fileName: filename });
  const companion = extractWorkbookCompanion(buffer, { filename, documentId });
  const base = {
    functionalRequirements: frExtracted.functionalRequirements || [],
    nonFunctionalRequirements: companion.nonFunctionalRequirements || [],
    customerRawRows: companion.customerRawRows || emptyCustomerRawRows(),
    workbookDiagnostic: frExtracted.diagnostic || null,
    overview: {},
    scope: [],
    meta: {
      applied: false,
      source: 'none',
      filename,
      documentId,
    },
  };

  const isCustomerRaw =
    peekCustomerRawTemplateType(buffer) === CUSTOMER_RAW_TEMPLATE_TYPE;

  if (isCustomerRaw) {
    try {
      const raw = parseCustomerRawContext(buffer);
      const overview = mergeOverview({}, raw.context || {});
      if (raw.meta?.projectName && !overview.requirementName) {
        overview.requirementName = normProse(raw.meta.projectName);
      }
      const canonicalRaw = raw.canonicalRaw || null;
      // Prefer Section Input from canonicalRaw; dual-read pack extract as fallback
      let functionalRequirements = base.functionalRequirements;
      let nonFunctionalRequirements = base.nonFunctionalRequirements;
      let scope = scopeFromContext(raw.context || {});
      if (canonicalRaw) {
        const frSec = buildSectionInput('fr', canonicalRaw);
        const frRows = frSectionToPackRows(frSec);
        if (frRows.length) {
          functionalRequirements = mergeByExternalId(frRows, functionalRequirements);
        }
        const nfrSec = buildSectionInput('nfr', canonicalRaw);
        const nfrRows = nfrSectionToPackRows(nfrSec);
        if (nfrRows.length) {
          nonFunctionalRequirements = mergeByExternalId(nfrRows, nonFunctionalRequirements);
        }
        const scopeCanon = scopeFromCanonicalRaw(canonicalRaw);
        if (scopeCanon.length) scope = scopeCanon;
      }
      const frCount = functionalRequirements.length;
      const hasOverview = Boolean(
        overview.projectObjective || overview.requirementName || overview.businessScope
      );
      const applied = frCount > 0 || hasOverview || scope.length > 0
        || nonFunctionalRequirements.length > 0
        || (base.customerRawRows.businessRequests || []).length > 0
        || (base.customerRawRows.references || []).length > 0;
      return {
        ...base,
        functionalRequirements,
        nonFunctionalRequirements,
        overview,
        scope,
        canonicalRaw,
        meta: {
          applied,
          source: applied ? 'customer_raw' : 'none',
          reason: applied ? undefined : 'customer_raw_empty',
          filename,
          documentId,
          frCount,
          intakeKind: 'customer_raw',
        },
        workbookDiagnostic: (() => {
          const diag = raw.workbookDiagnostic || base.workbookDiagnostic;
          if (diag && typeof diag === 'object') {
            return { ...diag, intakeKind: 'customer_raw' };
          }
          return diag;
        })(),
      };
    } catch (err) {
      return {
        ...base,
        workbookDiagnostic: (() => {
          const diag =
            base.workbookDiagnostic
            || failedDiagnostic('PARSER_ERROR', err.message || 'parse_fail', filename);
          if (diag && typeof diag === 'object') {
            return { ...diag, intakeKind: 'customer_raw' };
          }
          return diag;
        })(),
        meta: {
          applied: base.functionalRequirements.length > 0,
          source: base.functionalRequirements.length > 0 ? 'customer_raw' : 'none',
          reason: String(err.message || 'parse_fail').slice(0, 120),
          filename,
          documentId,
          intakeKind: 'customer_raw',
        },
      };
    }
  }

  // Non-Customer-Raw: try full requirement workbook, then FR extractor alone.
  let parsed = null;
  try {
    parsed = parseRequirementWorkbook(buffer);
    const frCount = Array.isArray(parsed?.functionalRequirements)
      ? parsed.functionalRequirements.length
      : 0;
    const hasOverview = Boolean(
      parsed?.overview
      && (parsed.overview.projectObjective
        || parsed.overview.requirementName
        || parsed.overview.businessScope)
    );
    if (!frCount && !hasOverview) parsed = null;
  } catch {
    parsed = null;
  }

  if (parsed) {
    const overview = mergeOverview({}, parsed.overview || {});
    const scope = Array.isArray(parsed.scope) ? parsed.scope : [];
    const functionalRequirements = mergeByExternalId(
      parsed.functionalRequirements || [],
      base.functionalRequirements
    );
    const nonFunctionalRequirements = mergeByExternalId(
      parsed.nonFunctionalRequirements || parsed.nfrs || [],
      base.nonFunctionalRequirements
    );
    return {
      functionalRequirements,
      nonFunctionalRequirements,
      customerRawRows: base.customerRawRows,
      workbookDiagnostic: base.workbookDiagnostic,
      overview,
      scope,
      businessGoals: Array.isArray(parsed.businessGoals) ? parsed.businessGoals : [],
      businessRules: Array.isArray(parsed.businessRules) ? parsed.businessRules : [],
      businessProcesses: Array.isArray(parsed.businessProcesses) ? parsed.businessProcesses : [],
      useCases: Array.isArray(parsed.useCases) ? parsed.useCases : [],
      meta: {
        applied: true,
        source: 'requirement_workbook',
        filename,
        documentId,
        frCount: functionalRequirements.length,
      },
    };
  }

  const applied = base.functionalRequirements.length > 0
    || base.nonFunctionalRequirements.length > 0;
  return {
    ...base,
    meta: {
      applied,
      source: applied ? 'workbook_fr' : 'none',
      reason: applied ? undefined : 'no_structured_rows',
      filename,
      documentId,
      frCount: base.functionalRequirements.length,
    },
  };
}

/**
 * Legacy adapter: applies one workbook result onto a pack copy.
 * Prefer prefillWorkbook + aggregateWorkbookResults for multi-file packs.
 *
 * @param {object} packInput
 * @param {Buffer} buffer
 * @param {{ filename?: string, documentId?: string }} opts
 */
function prefillPackFromRawWorkbook(packInput, buffer, opts = {}) {
  const pack = packInput && typeof packInput === 'object' ? { ...packInput } : {};
  const result = prefillWorkbook(buffer, {
    filename: opts.filename,
    documentId: opts.documentId,
  });

  if (!result.meta?.applied && !result.functionalRequirements.length) {
    if (result.workbookDiagnostic) {
      const ai = pack.aiAnalysis && typeof pack.aiAnalysis === 'object'
        ? { ...pack.aiAnalysis }
        : {};
      ai.workbookDiagnostic = result.workbookDiagnostic;
      pack.aiAnalysis = ai;
    }
    return {
      pack,
      meta: {
        applied: false,
        source: result.meta?.source || 'none',
        reason: result.meta?.reason,
        filename: opts.filename,
      },
    };
  }

  pack.overview = mergeOverview(pack.overview, result.overview || {});
  if ((!Array.isArray(pack.scope) || !pack.scope.length) && Array.isArray(result.scope) && result.scope.length) {
    pack.scope = result.scope;
  }
  pack.functionalRequirements = mergeByExternalId(
    pack.functionalRequirements,
    result.functionalRequirements
  );
  pack.nonFunctionalRequirements = mergeByExternalId(
    pack.nonFunctionalRequirements || pack.nfrs,
    result.nonFunctionalRequirements
  );
  if (Array.isArray(result.businessGoals)) {
    pack.businessGoals = mergeByExternalId(pack.businessGoals, result.businessGoals);
  }
  if (Array.isArray(result.businessRules)) {
    pack.businessRules = mergeByExternalId(pack.businessRules, result.businessRules);
  }
  if (Array.isArray(result.businessProcesses)) {
    pack.businessProcesses = mergeByExternalId(pack.businessProcesses, result.businessProcesses);
  }
  if (Array.isArray(result.useCases)) {
    pack.useCases = mergeByExternalId(pack.useCases, result.useCases);
  }

  const ai = pack.aiAnalysis && typeof pack.aiAnalysis === 'object' ? { ...pack.aiAnalysis } : {};
  if (result.workbookDiagnostic) ai.workbookDiagnostic = result.workbookDiagnostic;
  if (result.customerRawRows) ai.customerRawRows = result.customerRawRows;
  if (result.canonicalRaw) ai.canonicalRaw = result.canonicalRaw;
  pack.aiAnalysis = ai;

  return {
    pack,
    meta: {
      applied: true,
      source: result.meta?.source || 'workbook',
      filename: opts.filename,
      frCount: result.functionalRequirements.length,
    },
  };
}

module.exports = {
  prefillWorkbook,
  prefillPackFromRawWorkbook,
  mergeOverview,
  mergeByExternalId,
};
