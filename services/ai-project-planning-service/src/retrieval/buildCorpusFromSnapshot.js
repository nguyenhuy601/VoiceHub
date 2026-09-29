/**
 * Build G7 text corpus from a run-scoped snapshot (+ G1 catalogs).
 * RULE-09: only snapshot/run input — no live DB. Cap docs to avoid prompt bloat.
 */

const CORPUS_CAP = 200;

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

/**
 * @param {object|null|undefined} snapshot
 * @returns {object[]}
 */
function buildCorpusFromSnapshot(snapshot) {
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

  // srs_canonical — RULE-G7-02: projected.srs.functionalRequirements is SoT when present
  // (including []). Fallback to top-level only when the property is missing.
  const srsFrProp = projected?.srs?.functionalRequirements;
  const frs =
    srsFrProp !== undefined && srsFrProp !== null
      ? Array.isArray(srsFrProp)
        ? srsFrProp
        : []
      : Array.isArray(snapshot.functionalRequirements)
        ? snapshot.functionalRequirements
        : Array.isArray(projected.functionalRequirements)
          ? projected.functionalRequirements
          : [];
  const seenFr = new Set();
  let skippedMissingExternalId = 0;
  for (const fr of frs) {
    // RULE-G7-01: sourceId MUST be externalId — never fall back to id/frId.
    const externalId = String(fr?.externalId || '').trim();
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
};
