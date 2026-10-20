/**
 * Soft SRS → Agile WBS mapping.
 * Epic ← Business Goal (outcome); Feature ← product capability / module;
 * Story/Task keep FR/UC/NFR as source*Ids only (traceability), not hierarchy identity.
 */

const {
  normalizeNameKey,
  namesEqual,
  resolveFeatureDisplayName,
  looksLikeTechnicalLeafTitle,
} = require('./wbsAgileNaming');

function listFrRows(pack = {}) {
  if (Array.isArray(pack.functionalRequirements)) return pack.functionalRequirements;
  if (Array.isArray(pack.frList)) return pack.frList;
  if (Array.isArray(pack.requirements)) return pack.requirements;
  return [];
}

function listBgRows(pack = {}) {
  if (Array.isArray(pack.businessGoals)) return pack.businessGoals;
  if (Array.isArray(pack.goals)) return pack.goals;
  return [];
}

function listNfrRows(pack = {}) {
  if (Array.isArray(pack.nonFunctionalRequirements)) return pack.nonFunctionalRequirements;
  if (Array.isArray(pack.nfrs)) return pack.nfrs;
  return [];
}

function listUcRows(pack = {}) {
  if (Array.isArray(pack.useCases)) return pack.useCases;
  if (Array.isArray(pack.ucList)) return pack.ucList;
  return [];
}

function frRowId(row, index = 0) {
  return String(row?.externalId || row?.id || row?._id || `FR-${index + 1}`).trim();
}

function bgRowId(row, index = 0) {
  return String(row?.goalId || row?.externalId || row?.id || row?._id || `BG-${index + 1}`).trim();
}

function bgDisplayName(row, index = 0) {
  const text = String(
    row?.statement || row?.name || row?.title || row?.businessGoal || bgRowId(row, index)
  )
    .trim()
    .slice(0, 120);
  return text || bgRowId(row, index);
}

function nfrRowId(row, index = 0) {
  return String(row?.nfrId || row?.externalId || row?.id || row?._id || `NFR-${index + 1}`).trim();
}

function relatedIds(row, keys = []) {
  const out = [];
  for (const key of keys) {
    const val = row?.[key];
    if (Array.isArray(val)) out.push(...val.map(String).filter(Boolean));
    else if (val != null && String(val).trim()) out.push(String(val).trim());
  }
  return [...new Set(out)];
}

function stripVi(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function tokenizeForBgMatch(text) {
  return stripVi(text)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3);
}

/** Explicit CR-/FR- ids written into BG statement (e.g. "theo CR-009"). */
function extractFrIdsMentionedInText(text) {
  const out = [];
  const re = /\b((?:CR|FR)[-_]?\d{1,4})\b/gi;
  let m;
  while ((m = re.exec(String(text || ''))) !== null) {
    const raw = String(m[1] || '')
      .toUpperCase()
      .replace('_', '-');
    const norm = raw.replace(/^(CR|FR)(\d)/, '$1-$2');
    if (norm) out.push(norm);
  }
  return [...new Set(out)];
}

/**
 * Soft FR→BG when pack lacks relatedFrIds (common after import).
 * Scoring: id mention in BG text, token overlap, domain keyword pairs.
 */
function inferFrToBgLinks(pack = {}, already = new Map()) {
  const bgs = listBgRows(pack);
  const frs = listFrRows(pack);
  if (!bgs.length || !frs.length) return already;

  const bgMeta = bgs.map((row, i) => {
    const id = bgRowId(row, i);
    const name = bgDisplayName(row, i);
    const blob = `${name} ${row?.statement || ''} ${row?.description || ''}`;
    return {
      id,
      name,
      blob,
      tokens: new Set(tokenizeForBgMatch(blob)),
      mentionedFrIds: new Set(extractFrIdsMentionedInText(blob)),
    };
  });

  // Domain pairs outweigh generic token overlap (avoid "danh muc" pulling org FR into CRM BG).
  const DOMAIN_PAIRS = [
    {
      bg: /vai tro|phan quyen|role|permission|rbac/i,
      fr: /vai tro|phan quyen|\brole\b|permission|rbac/i,
      w: 48,
    },
    {
      bg: /to chuc|nhan su|quan he quan ly|org chart|so do/i,
      fr: /khu vuc|chi nhanh|\bteam\b|nhan su|so do to chuc|\borg\b/i,
      w: 48,
    },
    {
      bg: /khach hang|du an|doanh thu uoc|phong cho thue/i,
      fr: /khach hang|thong tin du an|du an\.|phong cho thue/i,
      w: 48,
    },
    {
      bg: /giao dich|doanh thu thuc|vong doi|\bcoc\b/i,
      fr: /giao dich|\bcoc\b|uy nhiem|tinh luong|hoa hong|\bluong\b/i,
      w: 48,
    },
    {
      bg: /bao cao|chi so|thong ke|cr-?009/i,
      fr: /bao cao|thong ke|dashboard|chi so/i,
      w: 48,
    },
    {
      bg: /lich|thong bao|cong tac|collaboration/i,
      fr: /(^|\s)lich(\s|$)|thong bao|calendar|notify/i,
      w: 40,
    },
  ];

  function stripAccents(s) {
    return stripVi(s);
  }

  function frTitleHead(frRow) {
    // Prefer heading before "." / newline — import packs often paste form UI after the title.
    const raw = String(frRow?.name || frRow?.title || '').trim();
    const head = raw.split(/[.\n|/]/)[0].trim() || raw;
    return head.slice(0, 100);
  }

  function scoreFrToBg(frRow, bg, { includeDescription = true } = {}) {
    const frId = frRowId(frRow);
    const titlePart = includeDescription
      ? `${frId} ${frRow?.name || ''} ${frRow?.title || ''}`
      : `${frId} ${frTitleHead(frRow)}`;
    const frBlob = includeDescription
      ? `${titlePart} ${frRow?.description || ''}`
      : titlePart;
    const frNorm = stripAccents(frBlob);
    const bgNorm = stripAccents(bg.blob);
    let score = 0;
    if (bg.mentionedFrIds.has(frId) || bg.mentionedFrIds.has(frId.replace('-', ''))) {
      score += 100;
    }
    for (const mid of bg.mentionedFrIds) {
      if (mid.replace(/-/g, '') === frId.replace(/-/g, '')) score += 100;
    }
    const frTokens = tokenizeForBgMatch(frBlob);
    for (const t of frTokens) {
      if (bg.tokens.has(t)) score += 2;
    }
    for (const pair of DOMAIN_PAIRS) {
      if (pair.bg.test(bgNorm) && pair.fr.test(frNorm)) score += pair.w || 48;
    }
    if (
      /(^|\s)lich(\s|$)|thong bao|so do to chuc/.test(frNorm) &&
      /to chuc|nhan su/.test(bgNorm)
    ) {
      score += 36;
    }
    return score;
  }

  function pickBestBg(frRow) {
    // Prefer title-only match so boilerplate "Thêm khách hàng" in FR body
    // cannot pull org catalog FRs into CRM epic.
    let best = null;
    let bestScore = 0;
    for (const bg of bgMeta) {
      const s = scoreFrToBg(frRow, bg, { includeDescription: false });
      if (s > bestScore) {
        bestScore = s;
        best = bg;
      }
    }
    if (best && bestScore >= 40) return { best, bestScore };
    best = null;
    bestScore = 0;
    for (const bg of bgMeta) {
      const s = scoreFrToBg(frRow, bg, { includeDescription: true });
      if (s > bestScore) {
        bestScore = s;
        best = bg;
      }
    }
    return { best, bestScore };
  }

  const map = new Map(already);
  frs.forEach((row, i) => {
    const frId = frRowId(row, i);
    if (map.has(frId)) return;
    const { best, bestScore } = pickBestBg(row);
    if (best && bestScore > 0) {
      map.set(frId, { id: best.id, name: best.name, inferred: true });
    } else if (bgMeta.length) {
      const fallback = bgMeta[0];
      map.set(frId, { id: fallback.id, name: fallback.name, inferred: true });
    }
  });
  return map;
}

/**
 * FR id → primary Business Goal { id, name }.
 * Prefers BG.relatedFrIds; also FR.relatedBgIds / businessGoalId.
 * When links missing but pack has BGs → infer (token / domain / id-in-text).
 */
function buildFrToBgIndex(pack = {}) {
  const map = new Map();
  const bgs = listBgRows(pack);

  bgs.forEach((row, i) => {
    const id = bgRowId(row, i);
    const name = bgDisplayName(row, i);
    const frIds = relatedIds(row, ['relatedFrIds', 'sourceFrIds', 'frIds']);
    for (const frId of frIds) {
      if (!map.has(frId)) map.set(frId, { id, name });
    }
  });

  listFrRows(pack).forEach((row, i) => {
    const frId = frRowId(row, i);
    if (map.has(frId)) return;
    const bgRefs = relatedIds(row, [
      'relatedBgIds',
      'sourceBgIds',
      'businessGoalIds',
      'goalIds',
      'businessGoalId',
      'goalId',
    ]);
    if (!bgRefs.length) return;
    const bgRef = bgRefs[0];
    const hit = bgs.find((g, j) => bgRowId(g, j) === bgRef);
    if (hit) {
      map.set(frId, { id: bgRef, name: bgDisplayName(hit, bgs.indexOf(hit)) });
    }
  });

  if (bgs.length) {
    return inferFrToBgLinks(pack, map);
  }
  return map;
}

/**
 * FR id → NFR ids (soft).
 */
function buildFrToNfrIndex(pack = {}) {
  const map = new Map();
  listNfrRows(pack).forEach((row, i) => {
    const id = nfrRowId(row, i);
    const frIds = relatedIds(row, ['relatedFrIds', 'sourceFrIds', 'frIds']);
    for (const frId of frIds) {
      if (!map.has(frId)) map.set(frId, []);
      map.get(frId).push(id);
    }
  });
  listFrRows(pack).forEach((row, i) => {
    const frId = frRowId(row, i);
    const fromFr = relatedIds(row, ['relatedNfrIds', 'sourceNfrIds', 'nfrIds']);
    if (!fromFr.length) return;
    const cur = map.get(frId) || [];
    map.set(frId, [...new Set([...cur, ...fromFr])]);
  });
  return map;
}

function capabilityForFr(capabilities = [], frId) {
  return (capabilities || []).find((c) =>
    (c.sourceFrIds || []).map(String).includes(String(frId))
  );
}

/**
 * Epic = business outcome (BG). Fallback: project overview outcome, then module.
 * @returns {{ epicKey: string, epicName: string, sourceBgIds: string[], epicOrigin: 'bg'|'overview'|'module' }}
 */
function resolveEpicPlacement({ frId, frRow = {}, pack = {}, frToBg = null } = {}) {
  const index = frToBg || buildFrToBgIndex(pack);
  const linked = index.get(String(frId));
  if (linked?.id && linked?.name) {
    return {
      epicKey: `bg:${linked.id}`,
      epicName: linked.name,
      sourceBgIds: [linked.id],
      epicOrigin: 'bg',
    };
  }

  // When pack has BGs, never collapse orphans (NFR / unlinked) into one overview mega-epic.
  const bgs = listBgRows(pack);
  if (bgs.length) {
    const row = bgs[0];
    const id = bgRowId(row, 0);
    const name = bgDisplayName(row, 0);
    return {
      epicKey: `bg:${id}`,
      epicName: name,
      sourceBgIds: [id],
      epicOrigin: 'bg',
    };
  }

  const overview = pack.overview || {};
  const outcome = String(
    overview.projectObjective || overview.requirementName || overview.businessScope || ''
  ).trim();
  if (outcome) {
    const key = normalizeNameKey(outcome).slice(0, 48) || 'outcome';
    return {
      epicKey: `outcome:${key}`,
      epicName: outcome.slice(0, 120),
      sourceBgIds: [],
      epicOrigin: 'overview',
    };
  }

  const rawModule = String(
    frRow.module || frRow.moduleLabel || frRow.moduleName || ''
  ).trim();
  // "General" is a weak placeholder from import — prefer pack title, else "Delivery"
  if (!rawModule || /^general$/i.test(rawModule)) {
    const packTitle = String(
      pack?.name || pack?.title || pack?.projectName || pack?.requirementName || ''
    ).trim();
    if (packTitle) {
      return {
        epicKey: `pack:${normalizeNameKey(packTitle).slice(0, 48) || 'pack'}`,
        epicName: packTitle.slice(0, 120),
        sourceBgIds: [],
        epicOrigin: 'pack',
      };
    }
    return {
      epicKey: 'module:delivery',
      epicName: 'Delivery',
      sourceBgIds: [],
      epicOrigin: 'fallback',
    };
  }
  return {
    epicKey: `module:${normalizeNameKey(rawModule) || 'module'}`,
    epicName: rawModule,
    sourceBgIds: [],
    epicOrigin: 'module',
  };
}

function isWeakModuleName(raw) {
  return !raw || /^(general|misc|other|common|n\/a|na|-)$/i.test(String(raw).trim());
}

/**
 * Feature candidate = product capability (not FR title, not forced "Capabilities — General").
 *
 * warrantSignal:
 * - explicit_feature — pack FR.feature* distinct from FR title
 * - capability — CapabilityTool / catalog capability distinct from FR
 * - module — real module (not General); BacklogMap only materializes Feature if ≥2 stories share it under the same Epic
 * - null — no Feature; Story may hang directly under Epic
 */
function resolveFeaturePlacement({
  frId,
  frRow = {},
  frName = '',
  capabilities = [],
  pack = {},
} = {}) {
  void pack;
  const title =
    String(frName || frRow.name || frRow.title || frId || '').trim() || String(frId || '');
  const moduleName =
    String(frRow.module || frRow.moduleLabel || frRow.moduleName || '').trim() || 'General';
  const cap = capabilityForFr(capabilities, frId);

  const explicitRaw = String(
    frRow.feature || frRow.featureName || frRow.featureLabel || cap?.feature || ''
  ).trim();
  const hasExplicit =
    Boolean(explicitRaw) &&
    !namesEqual(explicitRaw, title) &&
    !looksLikeTechnicalLeafTitle(explicitRaw);

  const capName = String(cap?.name || '').trim();
  const hasCapability =
    Boolean(capName) &&
    !namesEqual(capName, title) &&
    !looksLikeTechnicalLeafTitle(capName);

  const mod = String(cap?.module || moduleName).trim() || 'General';
  const hasModule = !isWeakModuleName(mod) && !namesEqual(mod, title);

  let warrantSignal = null;
  if (hasExplicit) warrantSignal = 'explicit_feature';
  else if (hasCapability) warrantSignal = 'capability';
  else if (hasModule) warrantSignal = 'module';

  // Only compute display name when a Feature may be warranted — avoid inventing
  // "Capabilities — General" buckets that force a useless middle layer.
  if (!warrantSignal) {
    return {
      featureKey: null,
      featureName: null,
      moduleName: mod,
      sourceCapabilityIds: [],
      capability: cap || null,
      warrantSignal: null,
    };
  }

  const featureName = resolveFeatureDisplayName({
    feature: hasExplicit ? explicitRaw : '',
    capabilityName: hasCapability ? capName : '',
    frName: title,
    moduleName: hasModule ? mod : 'General',
  });
  // Reject weak fallback label from naming helper
  if (/^capabilities\s*—/i.test(featureName) && isWeakModuleName(mod)) {
    return {
      featureKey: null,
      featureName: null,
      moduleName: mod,
      sourceCapabilityIds: [],
      capability: cap || null,
      warrantSignal: null,
    };
  }

  const featureKey = `${mod}::${featureName}`;
  const sourceCapabilityIds = cap?.capabilityId ? [String(cap.capabilityId)] : [];

  return {
    featureKey,
    featureName,
    moduleName: mod,
    sourceCapabilityIds,
    capability: cap || null,
    warrantSignal,
  };
}

/**
 * Soft trace bag for Story/Task — SRS refs, not hierarchy keys.
 */
function resolveSoftTrace({
  frId,
  pack = {},
  planningHints = null,
  frToBg = null,
  frToNfr = null,
  capabilities = [],
  sourceUcIds = null,
} = {}) {
  const bgIndex = frToBg || buildFrToBgIndex(pack);
  const nfrIndex = frToNfr || buildFrToNfrIndex(pack);
  const bg = bgIndex.get(String(frId));
  const cap = capabilityForFr(capabilities, frId);

  let ucIds = Array.isArray(sourceUcIds) ? sourceUcIds.map(String).filter(Boolean) : [];
  if (!ucIds.length) {
    const fr = listFrRows(pack).find((r, i) => frRowId(r, i) === String(frId));
    if (fr) {
      ucIds.push(...relatedIds(fr, ['useCaseIds', 'sourceUcIds', 'relatedUcIds', 'ucIds']));
    }
    for (const uc of listUcRows(pack)) {
      const frs = relatedIds(uc, ['sourceFrIds', 'frIds', 'relatedFrIds']);
      if (frs.includes(String(frId))) {
        ucIds.push(
          String(uc.externalId || uc.id || uc.ucKey || uc.ucId || '').trim()
        );
      }
    }
  }
  // Do not broadcast planningHints.ucIds onto every FR (noisy); pack links only.

  return {
    sourceFrIds: frId ? [String(frId)] : [],
    sourceBgIds: bg?.id ? [String(bg.id)] : [],
    sourceNfrIds: [...new Set((nfrIndex.get(String(frId)) || []).map(String))],
    sourceUcIds: [...new Set(ucIds.filter(Boolean))],
    sourceCapabilityIds: cap?.capabilityId ? [String(cap.capabilityId)] : [],
  };
}

/**
 * Build indexes once per WBS run.
 */
function buildSrsMappingContext(pack = {}, capabilities = [], planningHints = null) {
  return {
    pack,
    capabilities: Array.isArray(capabilities) ? capabilities : [],
    planningHints,
    frToBg: buildFrToBgIndex(pack),
    frToNfr: buildFrToNfrIndex(pack),
  };
}

module.exports = {
  listFrRows,
  listBgRows,
  listNfrRows,
  listUcRows,
  frRowId,
  bgRowId,
  bgDisplayName,
  nfrRowId,
  relatedIds,
  buildFrToBgIndex,
  inferFrToBgLinks,
  buildFrToNfrIndex,
  capabilityForFr,
  resolveEpicPlacement,
  resolveFeaturePlacement,
  isWeakModuleName,
  resolveSoftTrace,
  buildSrsMappingContext,
  namesEqual,
};
