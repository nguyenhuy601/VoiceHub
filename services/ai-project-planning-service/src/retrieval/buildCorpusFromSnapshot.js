/**
 * Build G7 text corpus from a run-scoped snapshot (+ G1 catalogs).
 * RULE-09: only snapshot/run input — no live DB. Cap docs to avoid prompt bloat.
 *
 * Step 3 (HOW Gate2 plan): also emit srs_nfr / srs_uc / srs_ac / srs_technology
 * so Quality/Arch retrieval can prefer those slices (not WHAT sectionDerive).
 */

const CORPUS_CAP = 200;
/** Soft per-type caps before final CORPUS_CAP slice (keep FR/skills room). */
const SLICE_CAPS = Object.freeze({
  nfr: 40,
  uc: 60,
  ac: 80,
  technology: 40,
});

/** Doc types added for HOW planning / Quality Plan retrieval. */
const HOW_SRS_DOC_TYPES = Object.freeze([
  'srs_nfr',
  'srs_uc',
  'srs_ac',
  'srs_technology',
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
 * @param {{ frOverride?: object[]|null }} [opts] — quality-valid normalized FR set (not LLM candidates)
 * @returns {object[]}
 */
function buildCorpusFromSnapshot(snapshot, opts = {}) {
  if (!snapshot || typeof snapshot !== 'object') return [];

  const docs = [];
  const snapshotId = snapshotIdOf(snapshot);
  const projected = snapshot.projected && typeof snapshot.projected === 'object'
    ? snapshot.projected
    : {};
  const g1 = snapshot.g1Catalogs && typeof snapshot.g1Catalogs === 'object'
    ? snapshot.g1Catalogs
    : {};
  const metaBase = snapshotId ? { snapshotId } : {};
  const frOverride = Array.isArray(opts.frOverride) ? opts.frOverride : null;

  // skill_def — run-scoped catalog
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
      metadata: { ...metaBase, skillId },
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
      metadata: { ...metaBase, metricId },
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
    pushDoc(docs, {
      id,
      sourceId: id,
      docType: 'evidence_span',
      text: String(span.text || span.snippet || ''),
      metadata: { ...metaBase },
    });
  }

  // srs_canonical — quality-valid override (RULE-DL-06) or projected.srs (RULE-G7-02)
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
    // RULE-G7-01: sourceId MUST be externalId — normalized rows use `id`.
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
      metadata: {
        ...metaBase,
        name: name || undefined,
        description: description || undefined,
        moduleLabel: moduleLabel || undefined,
        actor: actor || undefined,
        acceptanceCriteria: acceptanceCriteria || undefined,
        priority: priority || undefined,
      },
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
      metadata: {
        ...metaBase,
        category: category || undefined,
        requirement: requirement || undefined,
        target: target || undefined,
        priority: priority || undefined,
      },
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
      metadata: {
        ...metaBase,
        name: name || undefined,
        actor: actor || undefined,
        ucKey: externalId,
        relatedFr: relatedFr || undefined,
      },
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
        metadata: {
          ...metaBase,
          parentId,
          parentType,
          acIndex: j + 1,
          acceptanceCriteria: line,
        },
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
      metadata: {
        ...metaBase,
        name: n,
        category: cat,
        version: extra.version || undefined,
        mandatory: extra.mandatory === true ? true : undefined,
      },
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
        metadata: { ...metaBase },
      });
    });
  }

  return docs.slice(0, CORPUS_CAP);
}

module.exports = {
  buildCorpusFromSnapshot,
  CORPUS_CAP,
  SLICE_CAPS,
  HOW_SRS_DOC_TYPES,
  splitAcceptanceCriteria,
};
