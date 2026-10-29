/**
 * Gate 1 — Requirement Integrity Gate enforce (RULE-RIG).
 * Hard-block only; warnings (e.g. REL_EVIDENCE_REQUIRED) do not 409.
 * Legacy export names / errorCodes kept for compat wave.
 */

const HARD_BLOCK_KINDS = new Set(['data_integrity', 'relationship_integrity']);
const LEGACY_BLOCK_KINDS = new Set(['ambiguity', 'conflict']);
const HARD_REL_CODES = new Set([
  'REL_CIRCULAR',
  'REL_TARGET_MISSING',
  'REL_MISSING_ENDPOINT',
]);

function isHardBlockingItem(item) {
  if (!item || typeof item !== 'object') return false;
  const blockKind = String(item.blockKind || '');
  if (HARD_BLOCK_KINDS.has(blockKind)) return true;
  if (blockKind === 'ambiguity') {
    // Legacy: only incomplete_fields is integrity; vague semantic was mislabeled
    const kind = String(item.kind || 'incomplete_fields');
    return kind === 'incomplete_fields' || kind === 'ambiguity' || !item.kind;
  }
  if (blockKind === 'conflict') {
    const code = String(item.code || '');
    if (code === 'REL_EVIDENCE_REQUIRED') return false;
    return !code || HARD_REL_CODES.has(code) || Boolean(item.kind);
  }
  // Untyped legacy row with incomplete_fields
  if (String(item.kind || '') === 'incomplete_fields') return true;
  if (HARD_REL_CODES.has(String(item.code || ''))) return true;
  return false;
}

function normalizeGateShape(raw, source) {
  if (!raw || typeof raw !== 'object' || typeof raw.passed !== 'boolean') {
    return null;
  }
  const warnings = Array.isArray(raw.warnings)
    ? raw.warnings
    : Array.isArray(raw.findings)
      ? raw.findings
      : [];
  const rawBlocking = Array.isArray(raw.blocking) ? raw.blocking : [];
  const blocking = rawBlocking.filter(isHardBlockingItem);
  // Prefer recomputed pass from hard blocking (B2: ignore evidence warnings)
  const passed = blocking.length === 0;
  return {
    passed,
    blocking,
    warnings,
    ambiguities: Array.isArray(raw.ambiguities) ? raw.ambiguities : [],
    conflicts: Array.isArray(raw.conflicts) ? raw.conflicts : [],
    source,
    gateKind: raw.gateKind || 'requirement_integrity',
  };
}

/**
 * @param {object} pack
 * @returns {{ passed: boolean, blocking: array, source: string } | null}
 */
function resolveConflictAmbiguityFromPack(pack) {
  const phaseWhat =
    pack?.aiAnalysis?.phaseRuns?.phase_what || pack?.phaseRuns?.phase_what || {};
  const fromPhase =
    phaseWhat.requirementIntegrityGate || phaseWhat.conflictAmbiguityGate;
  const normalizedPhase = normalizeGateShape(
    fromPhase,
    phaseWhat.requirementIntegrityGate
      ? 'phaseRuns.phase_what.requirementIntegrityGate'
      : 'phaseRuns.phase_what.conflictAmbiguityGate'
  );
  if (normalizedPhase) return normalizedPhase;

  // Soft gaps may live on srsProposal completeness (no pack understanding blob)
  const proposal =
    pack?.aiAnalysis?.analyses?.srsProposal || pack?.analyses?.srsProposal || null;
  const fromProposal =
    proposal?.generated?.functionalRequirements?.meta?.requirementIntegrityGate ||
    proposal?.meta?.requirementIntegrityGate ||
    null;
  const normalizedProposal = normalizeGateShape(
    fromProposal,
    'analyses.srsProposal.requirementIntegrityGate'
  );
  if (normalizedProposal) return normalizedProposal;

  return null;
}

function isGate1ConflictAmbiguityEnforceEnabled(env = process.env) {
  const raw = String(env.GATE1_CONFLICT_AMBIGUITY_ENFORCE ?? '1')
    .trim()
    .toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'off';
}

/** Labels from RequirementAnalysisTool / requirementGaps → content field keys. */
const MISSING_LABEL_FIELD_KEYS = {
  'Acceptance criteria': ['ac', 'acceptanceCriteria'],
  Description: ['description', 'desc'],
  Priority: ['priority'],
  Actor: ['actor', 'actors', 'primaryActor'],
  'Error handling': ['errorHandling', 'error_handling'],
};

function nonEmpty(value) {
  return String(value ?? '').trim().length > 0;
}

function collectProposalItemsById(proposal) {
  const map = new Map();
  const generated = proposal?.generated && typeof proposal.generated === 'object'
    ? proposal.generated
    : {};
  for (const [section, block] of Object.entries(generated)) {
    if (section === 'synthesis' || section === '_legacySynthesisDisplay') continue;
    if (!block || typeof block !== 'object') continue;
    for (const it of block.items || []) {
      const logicalId = String(it?.logicalId || it?.id || '').trim();
      if (!logicalId) continue;
      map.set(logicalId, { section, item: it });
    }
  }
  return map;
}

function collectReviewDecisions(pack) {
  const proposal =
    pack?.aiAnalysis?.analyses?.srsProposal ||
    pack?.analyses?.srsProposal ||
    null;
  const fromProposal =
    proposal?.review?.decisions && typeof proposal.review.decisions === 'object'
      ? proposal.review.decisions
      : {};
  return { proposal, decisions: fromProposal, itemsById: collectProposalItemsById(proposal) };
}

function itemIdSet(logicalId, item) {
  return new Set(
    [logicalId, item?.logicalId, item?.id, item?.frId, item?.externalId, item?.upstreamId]
      .filter(Boolean)
      .map((v) => String(v))
  );
}

function findProposalEntryForBlock(block, itemsById) {
  const keys = [block?.requirementId, block?.frId, block?.id, block?.from, block?.to]
    .filter(Boolean)
    .map(String);
  for (const k of keys) {
    if (itemsById.has(k)) return { logicalId: k, ...itemsById.get(k) };
  }
  for (const [logicalId, entry] of itemsById.entries()) {
    const ids = itemIdSet(logicalId, entry.item);
    if (keys.some((k) => ids.has(k))) return { logicalId, ...entry };
  }
  return null;
}

function effectiveContentFields(item, decision) {
  const base = item && typeof item === 'object' ? item : {};
  const patch =
    decision?.editedPayload && typeof decision.editedPayload === 'object'
      ? decision.editedPayload
      : {};
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
    acceptanceCriteria:
      patch.acceptanceCriteria ?? patch.ac ?? base.acceptanceCriteria ?? base.ac ?? ac,
    description: patch.description ?? patch.desc ?? base.description ?? base.desc ?? '',
    priority: patch.priority ?? base.priority ?? '',
  };
}

function isMissingLabelStillEmpty(label, fields) {
  const keys = MISSING_LABEL_FIELD_KEYS[String(label || '').trim()] || [];
  if (!keys.length) {
    const camel = String(label || '')
      .trim()
      .replace(/\s+(\w)/g, (_, c) => c.toUpperCase())
      .replace(/^./, (c) => c.toLowerCase());
    return !nonEmpty(fields[camel]);
  }
  return !keys.some((k) => nonEmpty(fields[k]));
}

function decisionAction(decisions, logicalId) {
  const d = decisions?.[logicalId] || decisions?.[String(logicalId)];
  return String(d?.action || '').toLowerCase();
}

/**
 * Re-evaluate integrity blocking against BA review (edit/reject/create) + proposal content.
 * Snapshot gate from FR can stay stale after BA Sửa / Từ chối / Thêm dòng.
 */
function filterIntegrityBlockingByBaReview(pack, blocking) {
  const list = Array.isArray(blocking) ? blocking : [];
  if (!list.length) return [];
  const { decisions, itemsById } = collectReviewDecisions(pack);
  const out = [];

  for (const block of list) {
    const blockKind = String(block?.blockKind || '');
    const kind = String(block?.kind || '');
    const isData =
      blockKind === 'data_integrity' ||
      blockKind === 'ambiguity' ||
      kind === 'incomplete_fields' ||
      (!blockKind && kind === 'incomplete_fields');
    const isRel =
      blockKind === 'relationship_integrity' ||
      blockKind === 'conflict' ||
      HARD_REL_CODES.has(String(block?.code || ''));

    const entry = findProposalEntryForBlock(block, itemsById);
    const logicalId = entry?.logicalId || String(block?.requirementId || block?.id || '');
    const action = decisionAction(decisions, logicalId);
    const decision = decisions?.[logicalId] || decisions?.[String(logicalId)] || null;

    if (action === 'reject') {
      // Rejected rows are out of scope for Gate 1 integrity hard-block
      continue;
    }

    if (isRel) {
      const fromId = block?.from != null ? String(block.from) : '';
      const toId = block?.to != null ? String(block.to) : '';
      const fromRejected = fromId && decisionAction(decisions, fromId) === 'reject';
      const toRejected = toId && decisionAction(decisions, toId) === 'reject';
      if (fromRejected || toRejected) continue;
      out.push(block);
      continue;
    }

    if (!isData) {
      out.push(block);
      continue;
    }

    const fields = effectiveContentFields(entry?.item, decision);
    const missing = Array.isArray(block?.missing)
      ? block.missing.map(String).filter(Boolean)
      : [];

    if (!missing.length) {
      // Generic incomplete — drop when AC + description present after BA edit
      const still =
        isMissingLabelStillEmpty('Acceptance criteria', fields) ||
        isMissingLabelStillEmpty('Description', fields);
      if (!still && (action === 'edit' || action === 'create' || nonEmpty(fields.ac))) {
        continue;
      }
      out.push(block);
      continue;
    }

    const stillMissing = missing.filter((label) => isMissingLabelStillEmpty(label, fields));
    if (!stillMissing.length) continue;
    out.push({ ...block, missing: stillMissing });
  }

  return out;
}

function applyBaReviewToIntegrityGate(pack, gate) {
  if (!gate || gate.passed === true) return gate;
  const blocking = filterIntegrityBlockingByBaReview(pack, gate.blocking);
  return {
    ...gate,
    passed: blocking.length === 0,
    blocking,
    filteredByBaReview: true,
  };
}

/**
 * @param {{
 *   pack: object,
 *   forceApprove?: boolean,
 *   overrideReason?: string,
 *   env?: NodeJS.ProcessEnv,
 * }} args
 */
function assertGate1ConflictAmbiguityOrOverride({
  pack,
  forceApprove = false,
  overrideReason = '',
  env = process.env,
} = {}) {
  if (!isGate1ConflictAmbiguityEnforceEnabled(env)) {
    return {
      ok: true,
      gate: resolveConflictAmbiguityFromPack(pack),
      override: null,
      skipped: true,
    };
  }

  const rawGate = resolveConflictAmbiguityFromPack(pack);
  const gate = applyBaReviewToIntegrityGate(pack, rawGate);
  const forced = forceApprove === true || forceApprove === 'true' || forceApprove === 1;
  const reason = String(overrideReason || '').trim().slice(0, 2000);

  if (!gate) {
    return { ok: true, gate: null, override: null, missing: true };
  }

  if (gate.passed === true) {
    return { ok: true, gate, override: null };
  }

  if (forced) {
    if (!reason) {
      const err = new Error(
        'overrideReason bắt buộc khi forceApprove khi còn lỗi Requirement Integrity'
      );
      err.statusCode = 400;
      err.errorCode = 'CONFLICT_AMBIGUITY_OVERRIDE_REASON_REQUIRED';
      throw err;
    }
    return {
      ok: true,
      gate,
      override: {
        forceApprove: true,
        reason,
        blockingCount: gate.blocking.length,
        blocking: gate.blocking.slice(0, 20),
      },
    };
  }

  const err = new Error(
    'Requirement Integrity Gate: còn lỗi cấu trúc (missing fields / relationship) — bổ sung dữ liệu hoặc forceApprove kèm lý do trước Gate 1.'
  );
  err.statusCode = 409;
  err.errorCode = 'CONFLICT_AMBIGUITY_BLOCKING';
  err.details = {
    gate: {
      passed: false,
      blocking: gate.blocking.slice(0, 30),
      warnings: Array.isArray(gate.warnings) ? gate.warnings.slice(0, 20) : [],
      source: gate.source,
      gateKind: gate.gateKind || 'requirement_integrity',
      filteredByBaReview: Boolean(gate.filteredByBaReview),
    },
  };
  throw err;
}

module.exports = {
  assertGate1ConflictAmbiguityOrOverride,
  resolveConflictAmbiguityFromPack,
  isGate1ConflictAmbiguityEnforceEnabled,
  isHardBlockingItem,
  filterIntegrityBlockingByBaReview,
  applyBaReviewToIntegrityGate,
  HARD_BLOCK_KINDS,
  LEGACY_BLOCK_KINDS,
};
