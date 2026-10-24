/**
 * Canonical records for one snapshot.
 * Full source text stays here. Model inferences are annotations, not content.
 */

const { sha256 } = require('../semanticLayer/hash');

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  return [];
}

function text(value) {
  return String(value ?? '').trim();
}

function stableId(prefix, row, index, keys) {
  for (const key of keys) {
    const id = text(row?.[key]);
    if (id) return id;
  }
  return `${prefix}:${index + 1}`;
}

function acceptanceUnits(row) {
  const raw = row?.acceptanceCriteriaList || row?.acceptanceCriteria || row?.ac || row?.acs || row?.acceptance;
  const units = [];
  const push = (value, givenId) => {
    const line = text(value);
    if (!line) return;
    units.push({
      id: text(givenId) || `ac_${units.length + 1}`,
      text: line,
    });
  };
  if (Array.isArray(raw)) {
    raw.forEach((item, index) => {
      if (typeof item === 'string') push(item, `ac_${index + 1}`);
      else push(item?.text || item?.statement || item?.description, item?.id || `ac_${index + 1}`);
    });
  } else if (typeof raw === 'string') {
    raw.split(/\n|;/).forEach((part) => push(part));
  }
  return units;
}

function reviewOf(row) {
  const status = text(row?.reviewStatus || row?.review?.status || row?.status).toLowerCase();
  return {
    status: status || 'unreviewed',
    decisionId: text(row?.review?.decisionId || row?.decisionId) || null,
  };
}

function qualityIssues(content, nearDuplicate) {
  const issues = [];
  if (!content.title) issues.push({ code: 'MISSING_TITLE', field: 'title' });
  if (!content.description) issues.push({ code: 'MISSING_DESCRIPTION', field: 'description' });
  if (!content.acceptanceCriteria.length) {
    issues.push({ code: 'MISSING_ACCEPTANCE', field: 'acceptanceCriteria' });
  }
  if (nearDuplicate) {
    issues.push({ code: 'DUPLICATE_CANDIDATE', field: 'title', matches: nearDuplicate });
  }
  return {
    status: issues.length ? 'needs_confirmation' : 'ok',
    issues,
  };
}

function sourceRefsOf(row, fallbackField) {
  if (Array.isArray(row?.sourceRefs) && row.sourceRefs.length) return row.sourceRefs;
  if (row?.sourceRef && typeof row.sourceRef === 'object') return [row.sourceRef];
  return [{ sourceId: 'snapshot_pack', field: fallbackField }];
}

function entity(type, id, content, row, field) {
  const body = {
    entityId: id,
    entityType: type,
    revision: Number(row?.revision) > 0 ? Number(row.revision) : 1,
    schemaVersion: '1.0',
    content,
    provenance: {
      origin: 'customer_source',
      sourceRefs: sourceRefsOf(row, field),
    },
    review: reviewOf(row),
    contentHash: `sha256:${sha256(content)}`,
  };
  return body;
}

function understandingOf(pack, understanding) {
  return (
    understanding ||
    pack?.aiAnalysis?.requirementUnderstanding ||
    pack?.aiAnalysis?.g4Understanding ||
    null
  );
}

function annotationsFromUnderstanding(understanding) {
  const annotations = [];
  if (!understanding || typeof understanding !== 'object') return annotations;
  const rows = [
    ...asArray(understanding.requirements),
    ...asArray(understanding.semanticItems),
  ];
  const seen = new Set();
  for (const row of rows) {
    const entityId = text(row.id || row.frId || row.logicalId);
    if (!entityId) continue;
    const revision = Number(row.revision) > 0 ? Number(row.revision) : 1;
    const capability = text(row.semanticInterpretation?.capability || row.capability);
    const intent = text(row.semanticInterpretation?.intent || row.intent);
    for (const [annotationType, value] of [
      ['capability', capability],
      ['intent', intent],
    ]) {
      if (!value) continue;
      const key = `${entityId}:${annotationType}:${value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      annotations.push({
        annotationType,
        subjectRef: { entityId, revision },
        value,
        origin: 'llm_proposal',
        reviewStatus: 'pending',
        producerVersion: 'requirement-understanding-v1',
      });
    }
  }
  return annotations;
}

function markNearDuplicates(frs) {
  const byTitle = new Map();
  for (const row of frs) {
    const title = text(row.content.title).toLowerCase().replace(/\s+/g, ' ');
    if (!title) continue;
    if (!byTitle.has(title)) byTitle.set(title, []);
    byTitle.get(title).push(row);
  }
  for (const group of byTitle.values()) {
    const hashes = new Set(group.map((row) => row.contentHash));
    if (group.length < 2 || hashes.size < 2) continue;
    const ids = group.map((row) => row.entityId);
    for (const row of group) {
      row.quality = qualityIssues(row.content, ids.filter((id) => id !== row.entityId));
    }
  }
}

/**
 * @param {{ pack?: object, snapshot?: object, container?: object, stories?: object[], understanding?: object }} source
 */
function buildCanonicalStore(source = {}) {
  const pack = source.pack || {};
  const snapshot = source.snapshot || null;
  const container = source.container || {};
  const scope = {
    organizationId: text(pack.organizationId || snapshot?.organizationId) || null,
    projectId: text(pack.projectId || pack.id || snapshot?.projectId) || null,
  };
  const entities = [];

  const frs = [];
  const seenFr = new Set();
  asArray(pack.functionalRequirements).forEach((row, index) => {
    const id = stableId('fr', row, index, ['externalId', 'logicalId', 'id', 'frId']);
    if (seenFr.has(id)) return;
    seenFr.add(id);
    const content = {
      code: id,
      title: text(row.title || row.name),
      description: text(row.description || row.statement || row.detail || row.summary),
      moduleId: text(row.module || row.moduleName || row.moduleLabel) || null,
      feature: text(row.feature || row.featureName || row.featureLabel) || null,
      actorIds: []
        .concat(row.actorIds || row.actors || row.actor || row.primaryActor || [])
        .flat()
        .map((item) => text(item?.id || item))
        .filter(Boolean),
      priority: text(row.priority) || null,
      acceptanceCriteria: acceptanceUnits(row),
      relatedUcIds: []
        .concat(row.relatedUcKeys || row.useCaseIds || row.ucKeys || [])
        .map((item) => text(item))
        .filter(Boolean),
    };
    const record = entity('functional_requirement', id, content, row, 'functionalRequirements');
    record.scope = scope;
    record.quality = qualityIssues(content);
    frs.push(record);
  });
  markNearDuplicates(frs);
  entities.push(...frs);

  asArray(pack.useCases).forEach((row, index) => {
    const id = stableId('uc', row, index, ['externalId', 'ucKey', 'id']);
    const content = {
      code: id,
      title: text(row.title || row.name),
      description: text(row.description || row.statement || row.goal || row.summary),
      relatedFrIds: []
        .concat(row.relatedFrIds || row.frIds || row.sourceFrIds || [])
        .map((item) => text(item?.id || item))
        .filter(Boolean),
    };
    const record = entity('use_case', id, content, row, 'useCases');
    record.scope = scope;
    record.quality = { status: content.description ? 'ok' : 'needs_confirmation', issues: [] };
    entities.push(record);
  });

  asArray(pack.nonFunctionalRequirements).forEach((row, index) => {
    const id = stableId('nfr', row, index, ['externalId', 'nfrId', 'id']);
    const content = {
      code: id,
      title: text(row.name || row.title),
      description: text(row.statement || row.description || row.customerRequirement),
      category: text(row.category) || null,
      target: text(row.target || row.metric || row.threshold) || null,
      priority: text(row.priority) || null,
    };
    const record = entity('non_functional_requirement', id, content, row, 'nonFunctionalRequirements');
    record.scope = scope;
    record.quality = { status: content.description ? 'ok' : 'needs_confirmation', issues: [] };
    entities.push(record);
  });

  asArray(pack.businessRules).forEach((row, index) => {
    const id = stableId('br', row, index, ['externalId', 'brId', 'id']);
    const content = {
      code: id,
      title: text(row.title || row.name),
      description: text(row.statement || row.description || row.text),
      relatedFrIds: [].concat(row.relatedFrIds || row.frIds || []).map((item) => text(item)).filter(Boolean),
    };
    const record = entity('business_rule', id, content, row, 'businessRules');
    record.scope = scope;
    record.quality = { status: 'ok', issues: [] };
    entities.push(record);
  });

  const constraintText = text(pack.overview?.constraint || pack.constraint);
  if (constraintText) {
    const content = { code: 'constraint:overview', description: constraintText };
    const record = entity('constraint', 'constraint:overview', content, pack.overview || {}, 'overview.constraint');
    record.scope = scope;
    record.quality = { status: 'ok', issues: [] };
    entities.push(record);
  }

  const storyRows = asArray(source.stories).length
    ? asArray(source.stories)
    : asArray(container?.planning?.backlog?.stories).length
      ? asArray(container.planning.backlog.stories)
      : asArray(pack.stories);
  storyRows.forEach((row, index) => {
    const id = stableId('story', row, index, ['id', 'storyId', 'externalId']);
    const content = {
      code: id,
      title: text(row.name || row.title),
      description: text(row.description || row.statement),
      sourceFrIds: [].concat(row.sourceFrIds || row.fr || row.frIds || []).map((item) => text(item)).filter(Boolean),
      acceptanceCriteria: acceptanceUnits(row),
    };
    const record = entity('story', id, content, row, 'stories');
    record.scope = scope;
    record.quality = { status: 'ok', issues: [] };
    entities.push(record);
  });

  asArray(container?.planning?.tasks).forEach((row, index) => {
    const id = stableId('task', row, index, ['id', 'taskId']);
    const content = {
      code: id,
      title: text(row.name || row.title),
      description: text(row.description || row.summary),
      deliverable: text(row.deliverable || row.output),
      sourceFrIds: [].concat(row.sourceFrIds || []).map((item) => text(item)).filter(Boolean),
      sourceUcIds: [].concat(row.sourceUcIds || []).map((item) => text(item)).filter(Boolean),
      level: text(row.level) || 'task',
    };
    const record = entity('task', id, content, row, 'tasks');
    record.scope = scope;
    record.review = { status: 'run', decisionId: null };
    record.quality = { status: 'ok', issues: [] };
    entities.push(record);
  });

  return {
    snapshotId: text(source.snapshotId || snapshot?.snapshotId || snapshot?.id) || null,
    scope,
    entities,
    annotations: annotationsFromUnderstanding(understandingOf(pack, source.understanding)),
  };
}

module.exports = {
  buildCanonicalStore,
  acceptanceUnits,
};
