/**
 * BG Derive Input V2 — BG-specific semantic contract (not raw SRS dump).
 * RULE: keep lineage (id / relatedFrIds / sourceRefs); drop AC, full description,
 * NFR, evidence.value, duplicated requirementUnderstanding/semanticItems.
 */

const BG_FR_SOFT_CAP = 12;
const BG_THEME_CAP = 8;
const BG_EVIDENCE_REF_CAP = 24;
const BG_BRQ_CAP = 12;

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function clipText(value, max = 400) {
  const text = String(value ?? '').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

function frId(row) {
  return String(row?.externalId || row?.logicalId || row?.id || row?.frId || '').trim();
}

/** KEEP for BG: id, name, module, actor only. */
function slimFrForBg(row) {
  return {
    id: frId(row),
    name: clipText(row?.name || row?.title || row?.requirement || '', 160),
    module: clipText(row?.moduleLabel || row?.module || '', 60),
    actor: clipText(row?.actor || row?.userActor || '', 60),
  };
}

/** KEEP: businessGoal / stakeholder / priority (+ short title). */
function slimBrqForBg(row) {
  return {
    id: String(row?.requestId || row?.id || row?.externalId || '').trim(),
    title: clipText(row?.title || row?.requestTitle || '', 120),
    businessGoal: clipText(row?.businessGoal || row?.goal || '', 200),
    stakeholder: clipText(row?.stakeholder || '', 80),
    priority: clipText(row?.priority || '', 40),
  };
}

function slimEvidenceRefOnly(ev, i) {
  return {
    refId: String(ev?.id || ev?.sourceId || `E-${i + 1}`).trim(),
    frId: clipText(ev?.frId || '', 40),
  };
}

/**
 * Deterministic themes from FR modules and/or G4 capability labels (no extra LLM).
 */
function buildBusinessThemes(frRows, g4) {
  const byKey = new Map();

  for (const item of asArray(g4?.semanticItems)) {
    const cap = clipText(item?.semanticInterpretation?.capability || item?.capability || '', 80);
    const fr = String(item?.frId || '').trim();
    if (!cap || !fr) continue;
    const key = cap.toLowerCase();
    if (!byKey.has(key)) {
      byKey.set(key, {
        themeId: `THEME-${byKey.size + 1}`,
        name: cap,
        summary: clipText(item?.semanticInterpretation?.intent || cap, 160),
        frIds: [],
      });
    }
    const theme = byKey.get(key);
    if (!theme.frIds.includes(fr)) theme.frIds.push(fr);
  }

  if (!byKey.size) {
    for (const row of frRows) {
      const mod = row.module || 'General';
      const key = String(mod).toLowerCase();
      if (!byKey.has(key)) {
        byKey.set(key, {
          themeId: `THEME-${byKey.size + 1}`,
          name: mod,
          summary: clipText(`${mod} capabilities`, 120),
          frIds: [],
        });
      }
      const theme = byKey.get(key);
      if (row.id && !theme.frIds.includes(row.id)) theme.frIds.push(row.id);
    }
  }

  return [...byKey.values()]
    .map((t) => ({ ...t, frIds: t.frIds.slice(0, 8) }))
    .slice(0, BG_THEME_CAP);
}

/**
 * FR selection policy: BRQ-linked → module representatives → fill to soft cap.
 */
function selectFrForBg(frAll, brqAll) {
  const selected = [];
  const seen = new Set();

  function push(row) {
    if (!row?.id || seen.has(row.id)) return;
    if (selected.length >= BG_FR_SOFT_CAP) return;
    seen.add(row.id);
    selected.push(row);
  }

  const brqIds = new Set(brqAll.map((b) => b.id).filter(Boolean));
  for (const row of frAll) {
    const raw = row._requestId || row.requestId;
    if (raw && brqIds.has(String(raw))) push(row);
  }

  const modulesSeen = new Set();
  for (const row of frAll) {
    const mod = row.module || '';
    if (mod && modulesSeen.has(mod)) continue;
    if (mod) modulesSeen.add(mod);
    push(row);
  }

  for (const row of frAll) push(row);
  return selected;
}

function buildSourceRefMap(evidenceRefs) {
  const map = {};
  for (const ev of evidenceRefs) {
    const fr = String(ev.frId || '').trim();
    if (!fr) continue;
    if (!map[fr]) map[fr] = [];
    if (map[fr].length < 3) map[fr].push(ev.refId);
  }
  return map;
}

/**
 * @param {object} pack
 * @param {{ proposal?: object, g4Understanding?: object, evidence?: object[] }} [opts]
 */
function buildBgDeriveInput(pack, opts = {}) {
  const overview = {
    projectName: clipText(
      pack?.overview?.requirementName || pack?.overview?.projectName || '',
      120
    ),
    projectObjective: clipText(pack?.overview?.projectObjective || '', 280),
    businessScope: clipText(pack?.overview?.businessScope || '', 280),
    expectedUsers: clipText(pack?.overview?.expectedUsers || pack?.overview?.targetUsers || '', 160),
  };

  const frRaw = asArray(pack?.functionalRequirements);
  const fromProposal = asArray(opts.proposal?.generated?.functionalRequirements?.items).map((row) => ({
    externalId: row.logicalId || row.id,
    name: row.title || row.name,
    moduleLabel: row.module || row.moduleLabel,
    actor: row.actor,
    requestId: row.requestId,
  }));
  const merged = [];
  const seenFr = new Set();
  for (const row of [...fromProposal, ...frRaw]) {
    const slim = slimFrForBg(row);
    slim._requestId = String(row.requestId || row.businessRequestId || '').trim();
    if (!slim.id && !slim.name) continue;
    const key = slim.id || slim.name;
    if (seenFr.has(key)) continue;
    seenFr.add(key);
    merged.push(slim);
  }

  const brqAll = asArray(pack?.aiAnalysis?.customerRawRows?.businessRequests)
    .map(slimBrqForBg)
    .filter((r) => r.id || r.businessGoal || r.title)
    .slice(0, BG_BRQ_CAP);

  const requirements = selectFrForBg(merged, brqAll).map(({ _requestId, ...rest }) => rest);
  const g4 = opts.g4Understanding || opts.understanding || null;
  const businessThemes = buildBusinessThemes(requirements, g4);
  const evidenceRefs = asArray(opts.evidence || g4?.evidence)
    .slice(0, BG_EVIDENCE_REF_CAP)
    .map(slimEvidenceRefOnly)
    .filter((e) => e.refId || e.frId);

  return {
    engineId: 'bg',
    mode: 'raw_derive_v2',
    focus: 'business_goals',
    projectContext: {
      objective: overview.projectObjective,
      scope: overview.businessScope,
      expectedUsers: overview.expectedUsers
        ? overview.expectedUsers.split(/[,;/]/).map((s) => s.trim()).filter(Boolean)
        : [],
      projectName: overview.projectName,
    },
    businessThemes,
    requirements,
    businessRequests: brqAll,
    sourceRefs: buildSourceRefMap(evidenceRefs),
    evidenceRefs,
    deriveInstruction:
      'Derive business goal CANDIDATES. Prefer BRQ.businessGoal as primary signal; use themes + FR id/name only to enrich/split/normalize. Do not invent FR ids. Return goals[] with goalId, statement, relatedFrIds, sourceRefs.',
  };
}

/**
 * Profile BG input components for [bg_input_profile] logs.
 */
function profileBgDeriveInput(input, prompt) {
  const j = (v) => JSON.stringify(v ?? null).length;
  const fr = asArray(input?.requirements);
  const brq = asArray(input?.businessRequests);
  const themes = asArray(input?.businessThemes);
  const evidence = asArray(input?.evidenceRefs);
  const promptChars = String(prompt || '').length;
  return {
    projectContext: { chars: j(input?.projectContext) },
    businessThemes: { count: themes.length, chars: j(themes) },
    fr: {
      count: fr.length,
      chars: j(fr),
      avgChars: fr.length ? Math.round(j(fr) / fr.length) : 0,
    },
    brq: { count: brq.length, chars: j(brq) },
    evidenceRefs: { count: evidence.length, chars: j(evidence) },
    sourceRefs: { chars: j(input?.sourceRefs) },
    instruction: { chars: String(input?.deriveInstruction || '').length },
    TOTAL: {
      chars: promptChars,
      estimatedTokens: Math.round(promptChars / 4),
      inputObjectChars: j(input),
    },
  };
}

module.exports = {
  BG_FR_SOFT_CAP,
  BG_THEME_CAP,
  buildBgDeriveInput,
  profileBgDeriveInput,
  slimFrForBg,
  slimBrqForBg,
  selectFrForBg,
  buildBusinessThemes,
};
