/**
 * Gate1 UI — Requirement Integrity Gate onto sections + rows (RULE-RIG).
 * Mirrors project-service assertGate1ConflictAmbiguityOrOverride hard-blocking.
 * SoT: phaseRuns.phase_what.*Gate (pack understanding blobs retired — srsProposal only).
 */

import { normalizeIntegrityBlockKind } from './integrityGateLabels.js';

const MAX_BLOCKING_UI = 40;

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function isHardBlockingItem(item) {
  if (!item || typeof item !== 'object') return false;
  const blockKind = normalizeIntegrityBlockKind(item);
  if (blockKind === 'data_integrity') {
    const kind = String(item.kind || 'incomplete_fields');
    return kind === 'incomplete_fields' || kind === 'ambiguity' || !item.kind;
  }
  if (blockKind === 'relationship_integrity') {
    const code = String(item.code || '');
    if (code === 'REL_EVIDENCE_REQUIRED') return false;
    return true;
  }
  return false;
}

/**
 * @param {object|null|undefined} pack
 */
export function resolveConflictAmbiguityFromPack(pack) {
  const phaseWhat =
    pack?.aiAnalysis?.phaseRuns?.phase_what || pack?.phaseRuns?.phase_what || {};
  const fromPhase =
    phaseWhat.requirementIntegrityGate || phaseWhat.conflictAmbiguityGate;
  if (fromPhase && typeof fromPhase === 'object' && typeof fromPhase.passed === 'boolean') {
    return normalizeGate(
      fromPhase,
      phaseWhat.requirementIntegrityGate
        ? 'phaseRuns.phase_what.requirementIntegrityGate'
        : 'phaseRuns.phase_what.conflictAmbiguityGate'
    );
  }

  const proposal =
    pack?.aiAnalysis?.analyses?.srsProposal || pack?.analyses?.srsProposal || null;
  const fromProposal =
    proposal?.generated?.functionalRequirements?.meta?.requirementIntegrityGate ||
    proposal?.meta?.requirementIntegrityGate ||
    null;
  if (
    fromProposal &&
    typeof fromProposal === 'object' &&
    typeof fromProposal.passed === 'boolean'
  ) {
    return normalizeGate(fromProposal, 'analyses.srsProposal.requirementIntegrityGate');
  }

  return null;
}

function normalizeGate(raw, source) {
  const warnings = asArray(raw.warnings || raw.findings);
  const blocking = asArray(raw.blocking)
    .filter(isHardBlockingItem)
    .slice(0, MAX_BLOCKING_UI)
    .map((b, i) => normalizeBlockingItem(b, i));

  const ambiguities = asArray(raw.ambiguities).map((a, i) =>
    normalizeBlockingItem(
      { ...a, blockKind: a.blockKind || 'data_integrity' },
      i
    )
  );
  const conflicts = asArray(raw.conflicts).map((c, i) =>
    normalizeBlockingItem(
      { ...c, blockKind: c.blockKind || 'relationship_integrity' },
      i
    )
  );

  const list = blocking.length
    ? blocking
    : [...ambiguities, ...conflicts]
        .filter(isHardBlockingItem)
        .slice(0, MAX_BLOCKING_UI);

  return {
    passed: list.length === 0,
    blocking: list,
    warnings,
    ambiguities,
    conflicts,
    source,
    gateKind: raw.gateKind || 'requirement_integrity',
  };
}

function normalizeBlockingItem(raw, index) {
  const item = raw && typeof raw === 'object' ? raw : {};
  const requirementId = item.requirementId
    ? String(item.requirementId)
    : item.frId
      ? String(item.frId)
      : null;
  const from = item.from != null ? String(item.from) : null;
  const to = item.to != null ? String(item.to) : null;
  const blockKind = normalizeIntegrityBlockKind(item);
  const missing = Array.isArray(item.missing) ? item.missing.map(String) : [];
  const defaultMsg =
    blockKind === 'data_integrity'
      ? missing.length
        ? `Missing required fields: ${missing.join(', ')}`
        : 'Missing required fields'
      : item.message || item.code || 'Relationship integrity issue';

  return {
    id: String(item.id || requirementId || from || `block-${index + 1}`),
    blockKind,
    kind: String(
      item.kind ||
        (blockKind === 'data_integrity' ? 'incomplete_fields' : 'invalid_relationship')
    ),
    message: String(item.message || item.reason || defaultMsg),
    requirementId,
    from,
    to,
    code: item.code || null,
    cycle: item.cycle || null,
    missing,
    section: guessSectionForBlocking(item, requirementId, from, to),
  };
}

function guessSectionForBlocking(item, requirementId, from, to) {
  if (item.section) return String(item.section);
  if (requirementId || from || to) return 'functionalRequirements';
  return 'functionalRequirements';
}

function rowIdSet(row) {
  return new Set(
    [row?.logicalId, row?.id, row?.frId, row?.externalId, row?.upstreamId]
      .filter(Boolean)
      .map((v) => String(v))
  );
}

function blockingMatchesRow(block, row) {
  const ids = rowIdSet(row);
  if (!ids.size) return false;
  if (block.requirementId && ids.has(String(block.requirementId))) return true;
  if (block.from && ids.has(String(block.from))) return true;
  if (block.to && ids.has(String(block.to))) return true;
  if (block.id && ids.has(String(block.id))) return true;
  return false;
}

/** Labels from requirementGaps / RequirementAnalysisTool → row field keys. */
const MISSING_LABEL_FIELD_KEYS = {
  'Acceptance criteria': ['ac', 'acceptanceCriteria'],
  Description: ['description', 'desc'],
  Priority: ['priority'],
  Actor: ['actor', 'actors', 'primaryActor'],
  'Error handling': ['errorHandling', 'error_handling'],
};

function nonEmptyField(value) {
  return String(value ?? '').trim().length > 0;
}

/**
 * Merge row + BA edit payload for integrity re-check (UI).
 * Gate snapshot can stay stale after Sửa fills Acceptance criteria.
 */
export function effectiveRowFieldsForIntegrity(row, editedPayload) {
  const base = row && typeof row === 'object' ? row : {};
  const patch =
    editedPayload && typeof editedPayload === 'object' ? editedPayload : {};
  const ac =
    patch.ac ??
    patch.acceptanceCriteria ??
    base.ac ??
    base.acceptanceCriteria ??
    '';
  return {
    ...base,
    ...patch,
    ac,
    acceptanceCriteria: patch.acceptanceCriteria ?? patch.ac ?? base.acceptanceCriteria ?? base.ac ?? ac,
    description: patch.description ?? patch.desc ?? base.description ?? base.desc ?? '',
    priority: patch.priority ?? base.priority ?? '',
  };
}

function isMissingLabelStillEmpty(label, effective) {
  const keys = MISSING_LABEL_FIELD_KEYS[String(label || '').trim()] || [
    String(label || '')
      .trim()
      .replace(/\s+(\w)/g, (_, c) => c.toUpperCase())
      .replace(/^./, (c) => c.toLowerCase()),
  ];
  return !keys.some((k) => k && nonEmptyField(effective[k]));
}

/**
 * True when any row in the section still has unresolved integrity issues
 * after applying current Gate1 decisions / editedPayload.
 */
export function sectionHasUnresolvedIntegrityIssues(
  rows,
  decisions = {},
  getRowId = (row, index) => String(row?.logicalId || row?.id || `row-${index}`)
) {
  const list = Array.isArray(rows) ? rows : [];
  const dec = decisions && typeof decisions === 'object' ? decisions : {};
  for (let i = 0; i < list.length; i += 1) {
    const row = list[i];
    const id = getRowId(row, i);
    const remaining = filterBlockingIssuesForCurrentValues(
      row?.blockingIssues,
      row,
      dec[id]
    );
    if (remaining.length) return true;
  }
  return false;
}

/**
 * Drop / shrink incomplete_fields issues once the row (or edit) has the field.
 * Relationship integrity issues are kept as-is.
 */
export function filterBlockingIssuesForCurrentValues(issues, row, decision = null) {
  const list = Array.isArray(issues) ? issues : [];
  if (!list.length) return [];
  const effective = effectiveRowFieldsForIntegrity(row, decision?.editedPayload);
  const out = [];
  for (const issue of list) {
    const blockKind = normalizeIntegrityBlockKind(issue);
    if (blockKind !== 'data_integrity') {
      out.push(issue);
      continue;
    }
    const missing = Array.isArray(issue?.missing)
      ? issue.missing.map(String).filter(Boolean)
      : [];
    if (!missing.length) {
      // No structured missing list — if AC/desc look complete, hide generic incomplete flag.
      const stillLooksIncomplete =
        isMissingLabelStillEmpty('Acceptance criteria', effective) ||
        isMissingLabelStillEmpty('Description', effective);
      if (!stillLooksIncomplete && String(issue?.kind || '') === 'incomplete_fields') {
        continue;
      }
      out.push(issue);
      continue;
    }
    const stillMissing = missing.filter((label) =>
      isMissingLabelStillEmpty(label, effective)
    );
    if (!stillMissing.length) continue;
    out.push({ ...issue, missing: stillMissing });
  }
  return out;
}

/**
 * Annotate Gate1 bundle rows/sections with integrity UI metadata.
 */
export function attachConflictAmbiguityToGate1Bundle(bundle, pack) {
  const base = bundle && typeof bundle === 'object' ? bundle : {};
  const gate = resolveConflictAmbiguityFromPack(pack);
  if (!gate || gate.passed || !gate.blocking.length) {
    return {
      ...base,
      conflictAmbiguity: gate,
      requirementIntegrity: gate,
    };
  }

  const bySection = { ...(base.bySection || {}) };
  const conflictCountBySection = {};

  for (const key of Object.keys(bySection)) {
    const rows = asArray(bySection[key]).map((row) => {
      const issues = gate.blocking.filter((b) => blockingMatchesRow(b, row));
      if (!issues.length) return row;
      conflictCountBySection[key] = (conflictCountBySection[key] || 0) + 1;
      const primaryKind = normalizeIntegrityBlockKind(issues[0]);
      return {
        ...row,
        hasConflict: true,
        blockingIssues: issues,
        conflictKind: primaryKind,
        integrityKind: primaryKind,
      };
    });
    rows.sort((a, b) => Number(Boolean(b.hasConflict)) - Number(Boolean(a.hasConflict)));
    bySection[key] = rows;
  }

  for (const block of gate.blocking) {
    const section = block.section || 'functionalRequirements';
    const matchedSomewhere = Object.values(bySection).some((rows) =>
      asArray(rows).some((row) => blockingMatchesRow(block, row))
    );
    if (!matchedSomewhere) {
      conflictCountBySection[section] = (conflictCountBySection[section] || 0) + 1;
    }
  }

  const sections = asArray(base.sections).map((tab) => {
    const count = conflictCountBySection[tab.key] || 0;
    return count
      ? { ...tab, conflictCount: count, hasConflict: true }
      : { ...tab, conflictCount: 0, hasConflict: false };
  });

  const items = [];
  for (const key of Object.keys(bySection)) {
    items.push(...bySection[key]);
  }
  const orderedItems = asArray(base.items).length
    ? asArray(base.items).map((row) => {
        const sectionRows = bySection[row.section] || [];
        const hit = sectionRows.find(
          (r) => String(r.logicalId || r.id) === String(row.logicalId || row.id)
        );
        return hit || row;
      })
    : items;

  const annotatedGate = {
    ...gate,
    conflictRowCount: Object.values(conflictCountBySection).reduce((a, b) => a + b, 0),
    conflictCountBySection,
  };

  return {
    ...base,
    bySection,
    sections,
    items: orderedItems,
    conflictAmbiguity: annotatedGate,
    requirementIntegrity: annotatedGate,
  };
}

export default attachConflictAmbiguityToGate1Bundle;
