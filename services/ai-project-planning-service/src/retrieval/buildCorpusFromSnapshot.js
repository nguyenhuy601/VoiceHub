/**
 * Build RAG text corpus from a run-scoped snapshot (+ catalog catalogs).
 * RULE-09: only snapshot/run input — no live DB.
 * Index cap ≠ prompt budget — prefer keeping customer_raw / evidence when truncating.
 */

const { withProvenanceDefaults, ORIGIN, APPROVAL } = require('./provenanceFilters');
const { resolveScopeFromSnapshot } = require('./scopeFilter');

/** Index corpus cap (not prompt budget). */
const INDEX_CAP = 500;
/** @deprecated use INDEX_CAP — kept for callers */
const CORPUS_CAP = INDEX_CAP;

/** Soft per-type caps before final INDEX_CAP slice (keep FR/skills room). */
const SLICE_CAPS = Object.freeze({
  nfr: 40,
  uc: 60,
  ac: 80,
  technology: 40,
  customer_raw: 120,
  overview: 8,
  business_goal: 40,
  business_rule: 40,
  scope_item: 40,
  actor: 40,
});

/** Doc types added for HOW planning / Quality Plan retrieval. */
const HOW_SRS_DOC_TYPES = Object.freeze([
  'srs_nfr',
  'srs_uc',
  'srs_ac',
  'srs_technology',
]);

/** HOW-only planning resources — excluded from WHAT corpus. */
const HOW_ONLY_DOC_TYPES = Object.freeze([
  'skill_def',
  'employee_history',
  'srs_technology',
]);

const WHAT_CORPUS_DOC_TYPES = Object.freeze([
  'evidence_span',
  'overview',
  'customer_raw',
  'business_goal',
  'business_rule',
  'scope_item',
  'actor',
  'srs_canonical',
  'srs_nfr',
  'srs_uc',
  'srs_ac',
  'metric_def',
]);

/** Prefer these when applying INDEX_CAP (required-ish sources first). */
const INDEX_PRIORITY = Object.freeze([
  'customer_raw',
  'evidence_span',
  'overview',
  'srs_canonical',
  'business_goal',
  'business_rule',
  'scope_item',
  'actor',
  'srs_nfr',
  'srs_uc',
  'srs_ac',
  'metric_def',
  'skill_def',
  'srs_technology',
  'employee_history',
]);

function snapshotIdOf(snapshot) {
  return String(snapshot?.snapshotId || snapshot?.id || '').trim();
}

function pushDoc(docs, { id, sourceId, docType, text, metadata }) {
  const sid = String(sourceId || id || '').trim();
  if (!sid) return;
  const body = String(text || '').trim();
  if (!body) return;
  docs.push({
    id: String(id || sid),
    sourceId: sid,
    docType,
    text: body,
    metadata: metadata && typeof metadata === 'object' ? metadata : {},
  });
}

function applyIndexCap(docs, cap = INDEX_CAP) {
  if (!Array.isArray(docs) || docs.length <= cap) return docs;
  const rank = new Map(INDEX_PRIORITY.map((t, i) => [t, i]));
  const sorted = [...docs].sort((a, b) => {
    const ra = rank.has(a.docType) ? rank.get(a.docType) : 99;
    const rb = rank.has(b.docType) ? rank.get(b.docType) : 99;
    return ra - rb || String(a.sourceId).localeCompare(String(b.sourceId));
  });
  return sorted.slice(0, cap);
}

function skillNameOf(s) {
  if (typeof s === 'string') return s.trim();
  return String(s?.name || s?.skillName || '').trim();
}

function skillIdOf(s, name) {
  if (typeof s === 'object' && s?.skillId) return String(s.skillId);
  const slug = name.toLowerCase().replace(/\s+/g, '-');
  return `skill:${slug}`;
}

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

/** Prefer projected.srs, then commonFiltered / canonical / top-level. */
function resolveSrsBucket(snapshot, projected, key) {
  const srs = projected?.srs && typeof projected.srs === 'object' ? projected.srs : {};
  if (Array.isArray(srs[key])) return srs[key];
  const common = snapshot?.commonFiltered;
  if (common && Array.isArray(common[key])) return common[key];
  const canonical = snapshot?.canonical;
  if (canonical && Array.isArray(canonical[key])) return canonical[key];
  if (Array.isArray(snapshot?.[key])) return snapshot[key];
  if (Array.isArray(projected?.[key])) return projected[key];
  return [];
}

function rowExternalId(row, prefix, index) {
  const id = String(
    row?.externalId || row?.id || row?.ucKey || row?.nfrId || row?.key || ''
  ).trim();
  if (id) return id;
  return `${prefix}-${index + 1}`;
}

/**
 * Split acceptanceCriteria into discrete AC lines (numbered / bullet / newline).
 * @param {string} raw
 * @returns {string[]}
 */
function splitAcceptanceCriteria(raw) {
  const text = String(raw || '').trim();
  if (!text) return [];
  const parts = text
    .split(/\r?\n|(?:;\s*)|(?:(?<=\d)[.)]\s+)/)
    .map((p) => p.replace(/^[-*•]\s*/, '').trim())
    .filter((p) => p.length >= 2);
  if (parts.length > 1) return parts;
  return [text];
}

/**
 * @param {object|null|undefined} snapshot
 * @param {{
 *   frOverride?: object[]|null,
 *   phase?: 'what'|'how',
 *   pack?: object|null,
 *   scope?: object,
 * }} [opts]
 * @returns {object[]}
 */
function buildCorpusFromSnapshot(snapshot, opts = {}) {
  if (!snapshot || typeof snapshot !== 'object') return [];

  const phase = opts.phase === 'what' ? 'what' : 'how';
  const pack = opts.pack && typeof opts.pack === 'object' ? opts.pack : null;
  const docs = [];
  const snapshotId = snapshotIdOf(snapshot);
  const projected = snapshot.projected && typeof snapshot.projected === 'object'
    ? snapshot.projected
    : {};
  const g1 = snapshot.knowledgeCatalogs && typeof snapshot.knowledgeCatalogs === 'object'
    ? snapshot.knowledgeCatalogs
    : {};
  const scope =
    opts.scope ||
    resolveScopeFromSnapshot(snapshot, {
      snapshotId,
      projectId: opts.projectId,
      tenantId: opts.tenantId,
    });
  const provBase = {
    snapshotId: scope.snapshotId || snapshotId || undefined,
    projectId: scope.projectId || undefined,
    tenantId: scope.tenantId || undefined,
  };
  const metaBase = (extra = {}, prov = {}) =>
    withProvenanceDefaults(
      { ...provBase, ...extra },
      {
        origin: prov.origin || ORIGIN.CUSTOMER_IMPORT,
        approvalStatus: prov.approvalStatus || APPROVAL.DRAFT,
        ...provBase,
      }
    );
  const frOverride = Array.isArray(opts.frOverride) ? opts.frOverride : null;

  // overview
  const ov =
    (snapshot.overview && typeof snapshot.overview === 'object' && snapshot.overview) ||
    (projected.overview && typeof projected.overview === 'object' && projected.overview) ||
    (projected.srs?.overview && typeof projected.srs.overview === 'object'
      ? projected.srs.overview
      : {}) ||
    {};
  {
    const bits = [
      ov.requirementName || ov.projectName || ov.name,
      ov.projectObjective || ov.problemStatement || ov.summary || ov.description,
      ov.businessScope || ov.scope,
      ov.constraint,
    ]
      .map((p) => String(p || '').trim())
      .filter(Boolean);
    if (bits.length) {
      pushDoc(docs, {
        id: 'overview:main',
        sourceId: 'overview:main',
        docType: 'overview',
        text: bits.join('\n'),
        metadata: metaBase({ spanId: 'overview:main' }),
      });
    }
  }

  // customer_raw — from pack / snapshot rows
  {
    const raw =
      pack?.aiAnalysis?.customerRawRows ||
      pack?.customerRawRows ||
      projected.customerRawRows ||
      snapshot.customerRawRows ||
      {};
    let crCount = 0;
    const pushCr = (row, idx, bucket) => {
      if (!row || typeof row !== 'object' || crCount >= SLICE_CAPS.customer_raw) return;
      const sourceId = String(
        row.externalId || row.id || row.sourceId || row.key || `CR-${bucket}-${idx + 1}`
      ).trim();
      const text = [
        sourceId,
        row.name || row.title,
        row.description || row.text || row.requirement || row.content,
      ]
        .map((p) => String(p || '').trim())
        .filter(Boolean)
        .join('\n');
      if (!text) return;
      pushDoc(docs, {
        id: sourceId,
        sourceId,
        docType: 'customer_raw',
        text,
        metadata: metaBase(
          { spanId: sourceId, bucket },
          { origin: ORIGIN.CUSTOMER_IMPORT, approvalStatus: APPROVAL.DRAFT }
        ),
      });
      crCount += 1;
    };
    for (const key of [
      'requirements',
      'functionalRequirements',
      'businessRequests',
      'items',
    ]) {
      const list = Array.isArray(raw[key]) ? raw[key] : [];
      list.forEach((row, i) => pushCr(row, i, key));
    }
  }

  // business_goal / business_rule / scope_item / actor
  const pushSheetRows = (docType, rows, cap, idPrefix) => {
    const list = Array.isArray(rows) ? rows : [];
    let n = 0;
    for (let i = 0; i < list.length && n < cap; i += 1) {
      const row = list[i];
      if (!row || typeof row !== 'object') continue;
      const sourceId = String(
        row.externalId || row.id || row.key || `${idPrefix}-${i + 1}`
      ).trim();
      const text = [
        row.name || row.title || row.code,
        row.description || row.text || row.rule || row.goal || row.statement,
      ]
        .map((p) => String(p || '').trim())
        .filter(Boolean)
        .join('\n');
      if (!text) continue;
      pushDoc(docs, {
        id: sourceId,
        sourceId,
        docType,
        text,
        metadata: metaBase({ spanId: sourceId }),
      });
      n += 1;
    }
  };
  pushSheetRows(
    'business_goal',
    resolveSrsBucket(snapshot, projected, 'businessGoals').length
      ? resolveSrsBucket(snapshot, projected, 'businessGoals')
      : pack?.businessGoals || pack?.goals || projected.businessGoals || [],
    SLICE_CAPS.business_goal,
    'BG'
  );
  pushSheetRows(
    'business_rule',
    resolveSrsBucket(snapshot, projected, 'businessRules').length
      ? resolveSrsBucket(snapshot, projected, 'businessRules')
      : pack?.businessRules || projected.businessRules || [],
    SLICE_CAPS.business_rule,
    'BR'
  );
  pushSheetRows(
    'scope_item',
    resolveSrsBucket(snapshot, projected, 'scope').length
      ? resolveSrsBucket(snapshot, projected, 'scope')
      : pack?.scope || projected.scope || [],
    SLICE_CAPS.scope_item,
    'SCOPE'
  );
  pushSheetRows(
    'actor',
    resolveSrsBucket(snapshot, projected, 'actors').length
      ? resolveSrsBucket(snapshot, projected, 'actors')
      : pack?.actors || projected.actors || [],
    SLICE_CAPS.actor,
    'ACTOR'
  );

  // skill_def — run-scoped catalog (HOW)
  const skillCat =
    projected.skillCatalog || snapshot.skillCatalog || { skills: [] };
  const skills = Array.isArray(skillCat.skills) ? skillCat.skills : [];
  for (const s of skills) {
    const name = skillNameOf(s);
    if (!name) continue;
    const skillId = skillIdOf(s, name);
    const aliases =
      typeof s === 'object' && Array.isArray(s.aliases) ? s.aliases : [];
    const category =
      typeof s === 'object' && s.category ? String(s.category) : '';
    pushDoc(docs, {
      id: skillId,
      sourceId: skillId,
      docType: 'skill_def',
      text: [name, ...aliases, category].filter(Boolean).join(' '),
      metadata: metaBase(
        { skillId },
        { origin: ORIGIN.SYSTEM, approvalStatus: APPROVAL.APPROVED }
      ),
    });
  }

  // metric_def — platform seed pinned on snapshot
  const metrics = Array.isArray(g1.metricCatalog) ? g1.metricCatalog : [];
  for (const m of metrics) {
    const metricId = String(m?.metricId || '').trim();
    if (!metricId) continue;
    pushDoc(docs, {
      id: metricId,
      sourceId: metricId,
      docType: 'metric_def',
      text: [metricId, m.formula, m.description, m.unit].filter(Boolean).join(' '),
      metadata: metaBase(
        { metricId },
        { origin: ORIGIN.SYSTEM, approvalStatus: APPROVAL.APPROVED }
      ),
    });
  }

  // evidence_span
  const spans = [
    ...(Array.isArray(snapshot.evidenceSpans) ? snapshot.evidenceSpans : []),
    ...(Array.isArray(projected.evidenceSpans) ? projected.evidenceSpans : []),
  ];
  const seenSpan = new Set();
  for (const span of spans) {
    const id = String(span?.id || span?.sourceId || '').trim();
    if (!id || seenSpan.has(id)) continue;
    seenSpan.add(id);
    const approval = String(span.approvalStatus || '').trim() || APPROVAL.DRAFT;
    const origin = String(span.origin || '').trim() || ORIGIN.CUSTOMER_IMPORT;
    pushDoc(docs, {
      id,
      sourceId: id,
      docType: 'evidence_span',
      text: String(span.text || span.snippet || ''),
      metadata: metaBase(
        { spanId: id },
        { origin, approvalStatus: approval }
      ),
    });
  }

  // srs_canonical — quality-valid override (RULE-DL-06) or projected.srs (RULE-RAG-02)
  let frs;
  if (frOverride) {
    frs = frOverride;
  } else {
    const srsFrProp = projected?.srs?.functionalRequirements;
    frs =
      srsFrProp !== undefined && srsFrProp !== null
        ? Array.isArray(srsFrProp)
          ? srsFrProp
          : []
        : Array.isArray(snapshot.functionalRequirements)
          ? snapshot.functionalRequirements
          : Array.isArray(projected.functionalRequirements)
            ? projected.functionalRequirements
            : [];
  }
  const seenFr = new Set();
  let skippedMissingExternalId = 0;
  for (const fr of frs) {
    // RULE-RAG-01: sourceId MUST be externalId — normalized rows use `id`.
    const externalId = String(fr?.externalId || (frOverride ? fr?.id : '') || '').trim();
    if (!externalId) {
      skippedMissingExternalId += 1;
      continue;
    }
    if (seenFr.has(externalId)) continue;
    seenFr.add(externalId);
    const name = String(fr.name || fr.title || '').trim();
    const description = String(fr.description || '').trim();
    const moduleLabel = String(fr.moduleLabel || fr.module || '').trim();
    const actor = String(fr.actor || '').trim();
    const acceptanceCriteria = String(
      fr.acceptanceCriteria || fr.ac || ''
    ).trim();
    const priority = String(fr.priority || '').trim();
    const labeled = [
      name ? `name: ${name}` : '',
      description ? `description: ${description}` : '',
      moduleLabel ? `module: ${moduleLabel}` : '',
      actor ? `actor: ${actor}` : '',
      acceptanceCriteria ? `ac: ${acceptanceCriteria}` : '',
      priority ? `priority: ${priority}` : '',
    ].filter(Boolean);
    pushDoc(docs, {
      id: externalId,
      sourceId: externalId,
      docType: 'srs_canonical',
      text: labeled.join('\n'),
      metadata: metaBase(
        {
          name: name || undefined,
          description: description || undefined,
          moduleLabel: moduleLabel || undefined,
          actor: actor || undefined,
          acceptanceCriteria: acceptanceCriteria || undefined,
          priority: priority || undefined,
          spanId: externalId,
        },
        {
          origin: fr?.origin || ORIGIN.USER_EDIT,
          approvalStatus: fr?.approvalStatus || APPROVAL.DRAFT,
        }
      ),
    });
  }
  if (skippedMissingExternalId > 0) {
    console.warn(
      '[g7_corpus] skipped FR rows missing externalId=',
      skippedMissingExternalId
    );
  }

  // srs_nfr — non-functional requirements (HOW Quality / Arch)
  const nfrs = resolveSrsBucket(snapshot, projected, 'nonFunctionalRequirements');
  const seenNfr = new Set();
  let nfrCount = 0;
  for (let i = 0; i < nfrs.length && nfrCount < SLICE_CAPS.nfr; i += 1) {
    const nfr = nfrs[i];
    if (!nfr || typeof nfr !== 'object') continue;
    const externalId = rowExternalId(nfr, 'NFR', i);
    if (seenNfr.has(externalId)) continue;
    seenNfr.add(externalId);
    const category = String(nfr.category || nfr.type || '').trim();
    const requirement = String(
      nfr.requirement || nfr.name || nfr.title || nfr.description || ''
    ).trim();
    const target = String(nfr.target || nfr.metric || '').trim();
    const priority = String(nfr.priority || '').trim();
    const labeled = [
      category ? `category: ${category}` : '',
      requirement ? `requirement: ${requirement}` : '',
      target ? `target: ${target}` : '',
      priority ? `priority: ${priority}` : '',
    ].filter(Boolean);
    if (!labeled.length) continue;
    pushDoc(docs, {
      id: externalId,
      sourceId: externalId,
      docType: 'srs_nfr',
      text: labeled.join('\n'),
      metadata: metaBase({
        category: category || undefined,
        requirement: requirement || undefined,
        target: target || undefined,
        priority: priority || undefined,
        spanId: externalId,
      }),
    });
    nfrCount += 1;
  }

  // srs_uc — use cases
  const useCases = resolveSrsBucket(snapshot, projected, 'useCases');
  const seenUc = new Set();
  let ucCount = 0;
  for (let i = 0; i < useCases.length && ucCount < SLICE_CAPS.uc; i += 1) {
    const uc = useCases[i];
    if (!uc || typeof uc !== 'object') continue;
    const externalId = rowExternalId(uc, 'UC', i);
    if (seenUc.has(externalId)) continue;
    seenUc.add(externalId);
    const name = String(uc.name || uc.title || '').trim();
    const description = String(uc.description || '').trim();
    const actor = String(uc.actor || '').trim();
    const precondition = String(uc.precondition || uc.preconditions || '').trim();
    const mainFlow = String(uc.mainFlow || uc.flow || uc.steps || '').trim();
    const priority = String(uc.priority || '').trim();
    const relatedFr = Array.isArray(uc.relatedFrIds)
      ? uc.relatedFrIds.map(String).filter(Boolean).join(', ')
      : String(uc.relatedFr || uc.frId || '').trim();
    const labeled = [
      name ? `name: ${name}` : '',
      description ? `description: ${description}` : '',
      actor ? `actor: ${actor}` : '',
      precondition ? `precondition: ${precondition}` : '',
      mainFlow ? `mainFlow: ${mainFlow}` : '',
      relatedFr ? `relatedFr: ${relatedFr}` : '',
      priority ? `priority: ${priority}` : '',
    ].filter(Boolean);
    if (!labeled.length) continue;
    pushDoc(docs, {
      id: externalId,
      sourceId: externalId,
      docType: 'srs_uc',
      text: labeled.join('\n'),
      metadata: metaBase({
        name: name || undefined,
        actor: actor || undefined,
        ucKey: externalId,
        relatedFr: relatedFr || undefined,
        spanId: externalId,
      }),
    });
    ucCount += 1;
  }

  // srs_ac — discrete acceptance criteria (from FR + UC) for Quality catalog plan
  const seenAc = new Set();
  let acCount = 0;
  const pushAcDocs = (parentId, parentType, rawAc) => {
    const lines = splitAcceptanceCriteria(rawAc);
    for (let j = 0; j < lines.length && acCount < SLICE_CAPS.ac; j += 1) {
      const line = lines[j];
      const sourceId = `ac:${parentId}:${j + 1}`;
      if (seenAc.has(sourceId)) continue;
      seenAc.add(sourceId);
      pushDoc(docs, {
        id: sourceId,
        sourceId,
        docType: 'srs_ac',
        text: `parent: ${parentId}\nparentType: ${parentType}\nac: ${line}`,
        metadata: metaBase({
          parentId,
          parentType,
          acIndex: j + 1,
          acceptanceCriteria: line,
          spanId: sourceId,
        }),
      });
      acCount += 1;
    }
  };
  for (const fr of frs) {
    if (acCount >= SLICE_CAPS.ac) break;
    const externalId = String(fr?.externalId || (frOverride ? fr?.id : '') || '').trim();
    if (!externalId) continue;
    pushAcDocs(
      externalId,
      'fr',
      fr.acceptanceCriteria || fr.ac || ''
    );
  }
  for (let ui = 0; ui < useCases.length && acCount < SLICE_CAPS.ac; ui += 1) {
    const uc = useCases[ui];
    const externalId = rowExternalId(uc, 'UC', ui);
    const rawAc =
      uc?.acceptanceCriteria ||
      uc?.ac ||
      uc?.postcondition ||
      uc?.successCriteria ||
      '';
    if (!String(rawAc).trim()) continue;
    pushAcDocs(externalId, 'uc', rawAc);
  }

  // srs_technology — pack technology + Project technical stack (Step 0 SNAP)
  const techRows = resolveSrsBucket(snapshot, projected, 'technology');
  const technical =
    (projected.technical && typeof projected.technical === 'object'
      ? projected.technical
      : null) ||
    (snapshot?.commonFiltered?.technical &&
    typeof snapshot.commonFiltered.technical === 'object'
      ? snapshot.commonFiltered.technical
      : null) ||
    (snapshot?.technical && typeof snapshot.technical === 'object'
      ? snapshot.technical
      : null) ||
    {};
  const stack = technical.stack && typeof technical.stack === 'object' ? technical.stack : {};
  const techSeen = new Set();
  let techCount = 0;
  const pushTech = (name, category, extra = {}) => {
    const n = String(name || '').trim();
    if (!n || techCount >= SLICE_CAPS.technology) return;
    const cat = String(category || 'tech').trim().toLowerCase();
    const sourceId = `tech:${cat}:${n.toLowerCase().replace(/\s+/g, '-')}`;
    if (techSeen.has(sourceId)) return;
    techSeen.add(sourceId);
    pushDoc(docs, {
      id: sourceId,
      sourceId,
      docType: 'srs_technology',
      text: [`name: ${n}`, `category: ${cat}`, extra.version ? `version: ${extra.version}` : '']
        .filter(Boolean)
        .join('\n'),
      metadata: metaBase({
        name: n,
        category: cat,
        version: extra.version || undefined,
        mandatory: extra.mandatory === true ? true : undefined,
      }),
    });
    techCount += 1;
  };
  for (const t of techRows) {
    if (typeof t === 'string') {
      pushTech(t, 'tech');
      continue;
    }
    if (!t || typeof t !== 'object') continue;
    pushTech(t.name || t.title, t.category || t.layer || 'tech', {
      version: t.version,
      mandatory: t.mandatory,
    });
  }
  for (const lang of asArray(stack.languages)) pushTech(lang, 'language');
  for (const fw of asArray(stack.frameworks)) pushTech(fw, 'framework');
  for (const db of asArray(stack.databases)) pushTech(db, 'database');
  if (technical.cicd?.provider) {
    pushTech(technical.cicd.provider, 'cicd');
  }
  if (technical.deployment?.strategy) {
    pushTech(technical.deployment.strategy, 'deployment');
  }
  for (const env of asArray(technical.environments)) {
    const label = env?.name || env?.key;
    if (label) pushTech(label, 'environment');
  }

  // employee_history — role/domain/months only (no PII / email)
  const employees = Array.isArray(projected.employees) ? projected.employees : [];
  for (const emp of employees) {
    const empKey = String(emp?.employeeId || emp?.id || 'emp');
    const history = Array.isArray(emp?.history)
      ? emp.history
      : Array.isArray(emp?.pastProjects)
        ? emp.pastProjects
        : [];
    history.forEach((h, i) => {
      if (!h || typeof h !== 'object') return;
      const role = String(h.role || h.title || '').trim();
      const domain = String(h.domain || h.area || '').trim();
      const months = h.months != null ? String(h.months) : h.durationMonths != null
        ? String(h.durationMonths)
        : '';
      const text = [role, domain, months ? `${months} months` : '']
        .filter(Boolean)
        .join(' ');
      if (!text) return;
      const sourceId = `hist:${empKey}:${i}`;
      pushDoc(docs, {
        id: sourceId,
        sourceId,
        docType: 'employee_history',
        text,
        metadata: metaBase(
          { spanId: sourceId },
          { origin: ORIGIN.SYSTEM, approvalStatus: APPROVAL.DRAFT }
        ),
      });
    });
  }

  let out = docs;
  if (phase === 'what') {
    const allow = new Set(WHAT_CORPUS_DOC_TYPES);
    out = out.filter((d) => allow.has(d.docType) && !HOW_ONLY_DOC_TYPES.includes(d.docType));
  }
  return applyIndexCap(out, INDEX_CAP);
}

module.exports = {
  buildCorpusFromSnapshot,
  CORPUS_CAP,
  INDEX_CAP,
  SLICE_CAPS,
  HOW_SRS_DOC_TYPES,
  HOW_ONLY_DOC_TYPES,
  WHAT_CORPUS_DOC_TYPES,
  applyIndexCap,
  splitAcceptanceCriteria,
};
