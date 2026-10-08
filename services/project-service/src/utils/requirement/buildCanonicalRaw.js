/**
 * Build Canonical Raw intake SoT from Customer Raw workbook (Semantic Contract P1).
 * Physical parse kept; semantics/roles from Field Registry.
 * Does not rewrite "System shall…"; does not invent UC/BPM.
 */

const XLSX = require('xlsx');
const {
  CUSTOMER_RAW_TEMPLATE_VERSION,
  CUSTOMER_RAW_TEMPLATE_TYPE,
  CUSTOMER_RAW_SHEETS,
} = require('../../constants/customerRawTemplate.constants');
const {
  REGISTRY_VERSION,
  ROLES,
  lookupFieldBinding,
} = require('../../constants/customerRawFieldRegistry');
const { normHeader, normProse } = require('./requirementTemplateTextNorm');
const {
  readMeta,
  parseContextSheet,
  isCustomerRawTemplateType,
  looksLikeCustomerRawWorkbook,
} = require('./customerRawContextParse');
const { extractFromWorkbook } = require('./workbookFrExtract');
const { extractCompanionFromWorkbook } = require('./workbookCompanionExtract');

const MAX_TEXT = 4000;
const MAX_FR = 200;
const MAX_BRQ = 80;
const MAX_NFR = 100;
const MAX_REF = 80;

function clip(s, n = MAX_TEXT) {
  return String(s || '').slice(0, n);
}

function sheetToMatrix(workbook, sheetName) {
  const ws = workbook.Sheets[sheetName];
  if (!ws) return null;
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
}

function headerIndexes(headerRow) {
  const indexes = [];
  (headerRow || []).forEach((cell, index) => {
    const original = String(cell ?? '').trim();
    if (!original) return;
    indexes.push({ index, original, normalized: normHeader(original) });
  });
  return indexes;
}

function cellAt(line, index) {
  if (index == null || index < 0) return '';
  return line?.[index];
}

function emptyCanonicalRaw() {
  return {
    templateVersion: CUSTOMER_RAW_TEMPLATE_VERSION,
    registryVersion: REGISTRY_VERSION,
    templateType: CUSTOMER_RAW_TEMPLATE_TYPE,
    identities: {
      project: {},
      customer: {},
    },
    context: {},
    content: {
      businessObjectives: [],
      businessProblems: [],
      businessGoals: [],
      businessBenefits: [],
      customerStatements: [],
      scopes: [],
      scopeIn: [],
      scopeOut: [],
      businessOutcomes: [],
      businessDomains: [],
      functionalBehaviors: [],
      qualityRequirements: [],
    },
    classification: {},
    constraints: {},
    provenance: {
      sources: [],
      references: [],
      requirementEvidence: [],
    },
    records: {
      businessRequests: [],
      requirements: [],
      nfrs: [],
      references: [],
    },
    policy: {
      meta: {},
      readme: [],
    },
    counts: {},
  };
}

function pushUnique(arr, value) {
  const v = clip(normProse(value));
  if (!v) return;
  if (!arr.includes(v)) arr.push(v);
}

/**
 * Map 01_Project_Context values into canonical buckets.
 */
function applyContextSemantics(canonical, contextMap) {
  const ctx = contextMap || {};
  for (const [legacyKey, value] of Object.entries(ctx)) {
    if (!value) continue;
    // legacy keys from CONTEXT_LABEL_ALIASES → find semantic via field labels
    const labelGuess = {
      projectId: 'Project ID',
      projectName: 'Project Name',
      customer: 'Customer',
      businessDomain: 'Business Domain',
      projectObjective: 'Project Objective',
      businessProblem: 'Business Problem',
      businessScope: 'Business Scope',
      inScope: 'In Scope',
      outOfScope: 'Out of Scope',
      targetUsers: 'Target Users',
      expectedOutcome: 'Expected Outcome',
      targetPlatform: 'Target Platform',
      existingSystem: 'Existing System',
      integration: 'Integration',
      constraint: 'Constraint',
      deadline: 'Deadline',
      budget: 'Budget',
      priority: 'Priority',
      assumption: 'Assumption',
      source: 'Source',
    }[legacyKey];
    const binding = labelGuess
      ? lookupFieldBinding(CUSTOMER_RAW_SHEETS.CONTEXT, labelGuess)
      : null;
    if (!binding) {
      canonical.context[legacyKey] = clip(value);
      continue;
    }
    const { semantic, role } = binding;
    if (role === ROLES.PROVENANCE) {
      canonical.provenance.sources.push({
        semantic,
        value: clip(value),
        sheet: CUSTOMER_RAW_SHEETS.CONTEXT,
      });
      continue;
    }
    if (semantic === 'project_identity') {
      if (legacyKey === 'projectId') canonical.identities.project.id = clip(value, 64);
      else canonical.identities.project.name = clip(value, 200);
      continue;
    }
    if (semantic === 'customer_identity') {
      canonical.identities.customer.name = clip(value, 200);
      continue;
    }
    if (role === ROLES.CONTENT) {
      const bucket = {
        business_objective: 'businessObjectives',
        business_problem: 'businessProblems',
        scope: 'scopes',
        scope_in: 'scopeIn',
        scope_out: 'scopeOut',
        business_outcome: 'businessOutcomes',
        business_domain: 'businessDomains',
      }[semantic];
      if (bucket) pushUnique(canonical.content[bucket], value);
      else canonical.context[semantic] = clip(value);
      continue;
    }
    if (role === ROLES.CONSTRAINT) {
      canonical.constraints[semantic] = clip(value);
      continue;
    }
    if (role === ROLES.CLASSIFICATION) {
      canonical.classification[semantic] = clip(value, 64);
      continue;
    }
    canonical.context[semantic] = clip(value);
  }
}

function mapRowByRegistry(sheetName, fieldsObj) {
  const out = { content: {}, context: {}, classification: {}, constraints: {}, provenance: {} };
  for (const [header, value] of Object.entries(fieldsObj || {})) {
    const binding = lookupFieldBinding(sheetName, header);
    if (!binding || !value) continue;
    const { semantic, role } = binding;
    if (role === ROLES.TEMPLATE_POLICY || role === ROLES.IMPORT_METADATA) continue;
    if (role === ROLES.PROVENANCE) out.provenance[semantic] = clip(value);
    else if (role === ROLES.CLASSIFICATION) out.classification[semantic] = clip(value, 128);
    else if (role === ROLES.CONSTRAINT) out.constraints[semantic] = clip(value);
    else if (role === ROLES.CONTEXT) out.context[semantic] = clip(value);
    else out.content[semantic] = clip(value);
  }
  return out;
}

function buildRequirementsFromFr(extractedFrs, companion) {
  const sourcesById = new Map(
    (companion?.customerRawRows?.requirementSources || []).map((r) => [
      String(r.externalId || ''),
      r,
    ])
  );
  const records = [];
  for (const fr of (extractedFrs || []).slice(0, MAX_FR)) {
    const id = String(fr.externalId || fr.id || '').trim();
    if (!id) continue;
    const src = sourcesById.get(id);
    const fields = {
      'Requirement ID': id,
      Requirement: fr.name || fr.description || '',
      'Module / Area': fr.moduleLabel || fr.module || '',
      'User / Actor': fr.actor || '',
      Priority: fr.priority || '',
      'Acceptance / Expected Result': Array.isArray(fr.acceptanceCriteria)
        ? fr.acceptanceCriteria.join('\n')
        : fr.acceptanceCriteria || '',
      ...(src?.fields || {}),
    };
    // Prefer Request ID from companion extra fields if present
    if (src?.fields?.['Request ID'] || src?.fields?.['request id']) {
      fields['Request ID'] =
        src.fields['Request ID'] || src.fields['request id'];
    }
    const mapped = mapRowByRegistry(CUSTOMER_RAW_SHEETS.REQUIREMENT, fields);
    const behavior =
      mapped.content.functional_behavior ||
      clip(fr.name || fr.description || '');
    if (!behavior) continue;
    records.push({
      requirement_identity: id,
      functional_behavior: behavior,
      ...mapped.content,
      ...mapped.context,
      classification: mapped.classification,
      constraints: mapped.constraints,
      provenance: mapped.provenance,
      sheet: CUSTOMER_RAW_SHEETS.REQUIREMENT,
      row: src?.row || null,
    });
  }
  return records;
}

function buildBrqRecords(companion) {
  const rows = companion?.customerRawRows?.businessRequests || [];
  return rows.slice(0, MAX_BRQ).map((row) => {
    const mapped = mapRowByRegistry(
      CUSTOMER_RAW_SHEETS.BUSINESS_REQUEST,
      row.fields || {}
    );
    return {
      business_request_identity: row.externalId,
      ...mapped.content,
      ...mapped.context,
      classification: mapped.classification,
      constraints: mapped.constraints,
      provenance: mapped.provenance,
      sheet: row.sheet,
      row: row.row,
    };
  });
}

function buildNfrRecords(companion) {
  return (companion?.nonFunctionalRequirements || [])
    .slice(0, MAX_NFR)
    .map((n) => ({
      nfr_identity: n.externalId,
      quality_attribute: n.category || '',
      quality_requirement: n.requirement || '',
      quality_target: n.target || '',
      priority: n.priority || '',
      provenance: { source_type: n.source || '' },
      sheet: CUSTOMER_RAW_SHEETS.NFR,
    }))
    .filter((r) => r.quality_requirement);
}

function buildRefRecords(companion) {
  const rows = companion?.customerRawRows?.references || [];
  return rows.slice(0, MAX_REF).map((row) => {
    const mapped = mapRowByRegistry(CUSTOMER_RAW_SHEETS.REFERENCE, row.fields || {});
    return {
      reference_identity: row.externalId,
      ...mapped.provenance,
      sheet: row.sheet,
      row: row.row,
    };
  });
}

function aggregateFromRecords(canonical) {
  for (const brq of canonical.records.businessRequests) {
    pushUnique(canonical.content.businessGoals, brq.business_goal);
    pushUnique(canonical.content.businessProblems, brq.business_problem);
    pushUnique(canonical.content.businessBenefits, brq.business_benefit);
    pushUnique(canonical.content.customerStatements, brq.customer_statement);
  }
  for (const req of canonical.records.requirements) {
    canonical.content.functionalBehaviors.push({
      id: req.requirement_identity,
      functional_behavior: req.functional_behavior,
      actor: req.actor || '',
      functional_scope: req.functional_scope || '',
      business_request_reference: req.business_request_reference || '',
      acceptance_condition: req.constraints?.acceptance_condition || '',
      customer_constraint_or_note:
        req.constraints?.customer_constraint_or_note || '',
      priority: req.classification?.priority || '',
      requirement_type: req.classification?.requirement_type || '',
      provenance: req.provenance || {},
    });
    if (req.provenance && Object.keys(req.provenance).length) {
      canonical.provenance.requirementEvidence.push({
        requirement_identity: req.requirement_identity,
        ...req.provenance,
      });
    }
  }
  for (const nfr of canonical.records.nfrs) {
    canonical.content.qualityRequirements.push({
      id: nfr.nfr_identity,
      quality_attribute: nfr.quality_attribute,
      quality_requirement: nfr.quality_requirement,
      quality_target: nfr.quality_target,
      priority: nfr.priority,
      provenance: nfr.provenance || {},
    });
  }
  for (const ref of canonical.records.references) {
    canonical.provenance.references.push(ref);
  }
}

function readPolicySheets(workbook, canonical) {
  const meta = readMeta(workbook);
  for (const [k, v] of Object.entries(meta)) {
    if (!v) continue;
    const binding = lookupFieldBinding(
      CUSTOMER_RAW_SHEETS.META,
      k === 'templateType'
        ? 'TemplateType'
        : k === 'templateVersion'
          ? 'TemplateVersion'
          : k === 'projectName'
            ? 'ProjectName'
            : k === 'customerName'
              ? 'CustomerName'
              : k
    );
    if (binding?.role === ROLES.IMPORT_METADATA) {
      canonical.policy.meta[binding.semantic] = clip(v, 200);
    }
  }
  const readmeName = (workbook.SheetNames || []).find(
    (n) => normHeader(n) === 'readme'
  );
  if (readmeName) {
    const matrix = sheetToMatrix(workbook, readmeName);
    if (matrix?.length) {
      for (let r = 1; r < matrix.length; r += 1) {
        const topic = normProse(matrix[r]?.[0]);
        const guidance = normProse(matrix[r]?.[1]);
        if (!topic) continue;
        const binding = lookupFieldBinding(CUSTOMER_RAW_SHEETS.README, topic);
        canonical.policy.readme.push({
          topic,
          semantic: binding?.semantic || 'template_policy',
          role: ROLES.TEMPLATE_POLICY,
          // Do not treat as requirement content — store truncated policy only
          guidance: clip(guidance, 500),
        });
      }
    }
  }
}

/**
 * @param {Buffer|ArrayBuffer|Uint8Array|object} input — buffer or SheetJS workbook
 * @param {{ fileName?: string }} [opts]
 * @returns {object|null} canonicalRaw or null if not Customer Raw
 */
function buildCanonicalRaw(input, opts = {}) {
  let workbook;
  let buffer = null;
  if (input && input.SheetNames && input.Sheets) {
    workbook = input;
  } else {
    buffer = Buffer.isBuffer(input) ? input : Buffer.from(input || []);
    workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  }

  const meta = readMeta(workbook);
  const isRaw =
    isCustomerRawTemplateType(meta.templateType) ||
    looksLikeCustomerRawWorkbook(workbook);
  if (!isRaw) return null;

  const canonical = emptyCanonicalRaw();
  if (meta.templateVersion) {
    canonical.templateVersion = String(meta.templateVersion);
  }

  readPolicySheets(workbook, canonical);

  const { context } = parseContextSheet(workbook);
  applyContextSemantics(canonical, context);
  if (meta.projectName && !canonical.identities.project.name) {
    canonical.identities.project.name = clip(meta.projectName, 200);
  }
  if (meta.customerName && !canonical.identities.customer.name) {
    canonical.identities.customer.name = clip(meta.customerName, 200);
  }

  const extracted = extractFromWorkbook(workbook, { fileName: opts.fileName });
  const companion = extractCompanionFromWorkbook(workbook);

  canonical.records.businessRequests = buildBrqRecords(companion);
  canonical.records.requirements = buildRequirementsFromFr(
    extracted.functionalRequirements,
    companion
  );
  canonical.records.nfrs = buildNfrRecords(companion);
  canonical.records.references = buildRefRecords(companion);

  aggregateFromRecords(canonical);

  canonical.counts = {
    businessRequests: canonical.records.businessRequests.length,
    requirements: canonical.records.requirements.length,
    nfrs: canonical.records.nfrs.length,
    references: canonical.records.references.length,
    functionalBehaviors: canonical.content.functionalBehaviors.length,
    qualityRequirements: canonical.content.qualityRequirements.length,
  };

  // Ensure README/policy never leak into content arrays
  canonical.content._excludedRoles = [ROLES.TEMPLATE_POLICY, ROLES.IMPORT_METADATA];

  console.info(
    '[canonical_raw_built] registry=%s fr=%s nfr=%s brq=%s ref=%s',
    REGISTRY_VERSION,
    canonical.counts.requirements,
    canonical.counts.nfrs,
    canonical.counts.businessRequests,
    canonical.counts.references
  );

  return canonical;
}

/**
 * Build from file buffer via parseCustomerRawContext entry (convenience).
 */
function buildCanonicalRawFromBuffer(fileBuffer, opts = {}) {
  return buildCanonicalRaw(fileBuffer, opts);
}

module.exports = {
  buildCanonicalRaw,
  buildCanonicalRawFromBuffer,
  emptyCanonicalRaw,
  REGISTRY_VERSION,
};
