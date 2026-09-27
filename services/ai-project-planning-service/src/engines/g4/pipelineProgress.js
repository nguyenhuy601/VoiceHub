/**
 * WHAT / G4 progress catalog and the slim data-gate preview.
 * Substep ids match execution order inside runG4Pipeline.
 */

const FLAGGED_CAP = 30;
const ROW_CAP = 200;
const PAGE_LIMIT_MAX = 20;
const CELL_LIST_CAP = 8;

const SUBSTEPS = {
  prepare: { step: 1, substep: 'prepare' },
  parse: { step: 2, substep: 'parse' },
  normalize: { step: 2, substep: 'normalize' },
  extract: { step: 2, substep: 'extract' },
  filter: { step: 2, substep: 'filter' },
  quality: { step: 2, substep: 'quality' },
  gate_preview: { step: 2, substep: 'gate_preview' },
  semantic: { step: 3, substep: 'semantic' },
  conflict: { step: 3, substep: 'conflict' },
  validate: { step: 4, substep: 'validate' },
  synthesis: { step: 4, substep: 'synthesis' },
  evidence: { step: 4, substep: 'evidence' },
  feasibility: { step: 4, substep: 'feasibility' },
};

const FLAG_KEYS = {
  missing_actor: 'missingActor',
  missing_ac: 'missingAc',
  thin_text: 'thinText',
  ambiguous: 'ambiguous',
  duplicate: 'duplicate',
  cross_module: 'crossModule',
};

function substepMeta(substep) {
  return SUBSTEPS[substep] || null;
}

function emptyQuality() {
  return {
    missingActor: 0,
    missingAc: 0,
    thinText: 0,
    ambiguous: 0,
    duplicate: 0,
    crossModule: 0,
  };
}

function clipList(value) {
  return (Array.isArray(value) ? value : [])
    .slice(0, CELL_LIST_CAP)
    .map((item) => String(item));
}

function slimRow(row) {
  return {
    frId: String(row?.frId || ''),
    title: String(row?.title || '').slice(0, 160),
    description: String(row?.description || '').slice(0, 240),
    actors: clipList(row?.actors),
    actions: clipList(row?.actions),
    objects: clipList(row?.objects),
    fields: clipList(row?.fields),
    flags: Array.isArray(row?.flags) ? row.flags.map((flag) => String(flag)) : [],
    candidate: Boolean(row?.candidate),
  };
}

/**
 * Processed FR table + counts. Rows capped at 200. No corpus or raw signal text.
 * @param {{ functionalRequirements?: object[], signals?: object[], duplicates?: string[], selection?: object }} input
 */
function buildGatePreview(input = {}) {
  const functionalRequirements = Array.isArray(input.functionalRequirements)
    ? input.functionalRequirements
    : [];
  const signals = Array.isArray(input.signals) ? input.signals : [];
  const duplicates = Array.isArray(input.duplicates) ? input.duplicates : [];
  const selection = input.selection && typeof input.selection === 'object' ? input.selection : {};
  const quality = emptyQuality();
  const frById = new Map(
    functionalRequirements.map((fr) => [String(fr?.id || ''), fr])
  );
  const signalById = new Map(signals.map((signal) => [String(signal?.frId || ''), signal]));
  const candidateIds = new Set(
    (Array.isArray(selection.candidates) ? selection.candidates : []).map((row) =>
      String(row?.frId || '')
    )
  );
  const flagged = [];
  for (const signal of signals) {
    const flags = Array.isArray(signal?.flags) ? signal.flags : [];
    for (const flag of flags) {
      const key = FLAG_KEYS[flag];
      if (key) quality[key] += 1;
    }
    if (!flags.length || flagged.length >= FLAGGED_CAP) continue;
    const fr = frById.get(String(signal.frId || ''));
    const title = (fr && (fr.title || fr.name)) || '';
    flagged.push({
      frId: String(signal.frId || ''),
      title: String(title).slice(0, 160),
      flags: flags.map((flag) => String(flag)),
    });
  }
  const rows = functionalRequirements.slice(0, ROW_CAP).map((fr) => {
    const frId = String(fr?.id || '');
    const signal = signalById.get(frId) || {};
    return slimRow({
      frId,
      title: fr?.title || fr?.name || '',
      description: fr?.description || '',
      actors: signal.actors,
      actions: signal.actions,
      objects: signal.objects,
      fields: signal.fields,
      flags: signal.flags,
      candidate: candidateIds.has(frId),
    });
  });
  const counts = selection.counts || {};
  const candidates = Array.isArray(selection.candidates) ? selection.candidates : [];
  const clear = Array.isArray(selection.clear) ? selection.clear : [];
  return {
    frCount: functionalRequirements.length,
    duplicateCount: duplicates.length,
    candidateCount: Number(counts.candidates) || candidates.length,
    skippedCount: Number(counts.clear) || clear.length,
    quality,
    flagged,
    rowTotal: rows.length,
    rows,
  };
}

function summaryGatePreview(raw) {
  const qualityIn = raw.quality && typeof raw.quality === 'object' ? raw.quality : {};
  const quality = emptyQuality();
  for (const key of Object.keys(quality)) {
    quality[key] = Number(qualityIn[key]) || 0;
  }
  const flaggedIn = Array.isArray(raw.flagged) ? raw.flagged : [];
  const storedRows = Array.isArray(raw.rows) ? raw.rows : [];
  const rowTotal = Number.isFinite(Number(raw.rowTotal)) ? Number(raw.rowTotal) : storedRows.length;
  return {
    frCount: Number(raw.frCount) || 0,
    duplicateCount: Number(raw.duplicateCount) || 0,
    candidateCount: Number(raw.candidateCount) || 0,
    skippedCount: Number(raw.skippedCount) || 0,
    quality,
    flagged: flaggedIn.slice(0, FLAGGED_CAP).map((row) => ({
      frId: String(row?.frId || ''),
      title: String(row?.title || '').slice(0, 160),
      flags: Array.isArray(row?.flags) ? row.flags.map((flag) => String(flag)) : [],
    })),
    rowTotal,
  };
}

/**
 * Default publish omits rows. Pass { offset, limit } to return one page (max 20).
 * @param {object|null} raw
 * @param {{ offset?: number|string, limit?: number|string }|null} [page]
 */
function publishGatePreview(raw, page) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const summary = summaryGatePreview(raw);
  const wantsPage = page && page.offset != null && page.offset !== '';
  if (!wantsPage) return summary;
  const storedRows = Array.isArray(raw.rows) ? raw.rows : [];
  const offset = Math.max(0, Number(page.offset) || 0);
  const limit = Math.min(
    PAGE_LIMIT_MAX,
    Math.max(1, Number(page.limit) || PAGE_LIMIT_MAX)
  );
  return {
    ...summary,
    rows: storedRows.slice(offset, offset + limit).map(slimRow),
  };
}

module.exports = {
  FLAGGED_CAP,
  ROW_CAP,
  PAGE_LIMIT_MAX,
  SUBSTEPS,
  substepMeta,
  buildGatePreview,
  publishGatePreview,
};
