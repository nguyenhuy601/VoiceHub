/**
 * Job1 Data Analysis (W3b) — entities/CRUD/flows structured; FR-linked; drop orphans.
 * Does not require capability (Job1 before Job2).
 */

const {
  generateJson,
  analysisChunkTimeoutMs,
  ollamaModel,
  isAiPlanningLlmEnabled,
} = require('./ollamaClient');
const { normId, normKey, normProse } = require('./requirementTemplateTextNorm');
const {
  buildFrIdSet,
  buildRequirementFrSlices,
  buildProjectContextSlice,
  truncate,
} = require('./aiAnalysisFrSlice');

const SENSITIVITY = Object.freeze([
  'public',
  'internal',
  'confidential',
  'restricted',
  'pii',
]);

const REL_TYPES = Object.freeze([
  'belongs_to',
  'has_many',
  'has_one',
  'references',
  'uses',
  'contains',
]);

const ATTR_MAX = 12;
const ATTR_NAME_MAX = 64;
const ATTR_TYPE_MAX = 32;
const NAME_MAX = 120;
const CONSUMERS_MAX = 8;
const REL_MAX = 8;
const ENTITY_WALL_MS = 180000;
const ENTITY_CHUNK_SIZE = 12;
const ENTITY_MAX_CHUNKS = 8;
const ENTITY_NUM_PREDICT = 768;

function slugPart(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function normalizeSensitivity(raw) {
  const t = String(raw || '')
    .trim()
    .toLowerCase();
  if (!t) return '';
  if (SENSITIVITY.includes(t)) return t;
  if (t === 'secret' || t === 'private') return 'confidential';
  if (t === 'publicly' || t === 'open') return 'public';
  return '';
}

function normalizeCrud(raw) {
  const flags = { create: false, read: false, update: false, delete: false };
  if (!raw || typeof raw !== 'object') return flags;
  if (raw.create === true || raw.C === true || raw.c === true) flags.create = true;
  if (raw.read === true || raw.R === true || raw.r === true) flags.read = true;
  if (raw.update === true || raw.U === true || raw.u === true) flags.update = true;
  if (raw.delete === true || raw.D === true || raw.d === true) flags.delete = true;
  return flags;
}

function crudFromText(text) {
  const t = String(text || '').toLowerCase();
  return {
    create: /\b(create|add|register|insert|sign\s*up|new)\b/.test(t),
    read: /\b(read|view|list|get|fetch|display|show|search|query)\b/.test(t),
    update: /\b(update|edit|modify|change|patch)\b/.test(t),
    delete: /\b(delete|remove|revoke|deactivate|cancel)\b/.test(t),
  };
}

function ensureCrudHasRead(crud) {
  if (crud.create || crud.read || crud.update || crud.delete) return crud;
  return { ...crud, read: true };
}

/**
 * Cap attributes: string[] or {name,type}[] → normalized list (max ATTR_MAX).
 */
function normalizeAttributes(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const entry of raw) {
    if (out.length >= ATTR_MAX) break;
    if (typeof entry === 'string') {
      const name = normProse(entry).slice(0, ATTR_NAME_MAX);
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(name);
      continue;
    }
    if (entry && typeof entry === 'object') {
      const name = normProse(entry.name || entry.field || '').slice(0, ATTR_NAME_MAX);
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const type = normProse(entry.type || '').slice(0, ATTR_TYPE_MAX);
      out.push(type ? { name, type } : { name });
    }
  }
  return out;
}

function normalizeVolume(raw) {
  if (raw == null || raw === '') return undefined;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const s = truncate(String(raw), 64);
  return s || undefined;
}

function normalizeConsumers(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const c of raw) {
    if (out.length >= CONSUMERS_MAX) break;
    const name = normProse(c).slice(0, 80);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

function normalizeRelationships(raw, knownEntityIds) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const rel of raw) {
    if (out.length >= REL_MAX) break;
    if (!rel || typeof rel !== 'object') continue;
    const toEntityId = normId(rel.toEntityId || rel.to || '');
    if (!toEntityId) continue;
    if (knownEntityIds && !knownEntityIds.has(toEntityId)) continue;
    let type = String(rel.type || 'references')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_');
    if (!REL_TYPES.includes(type)) type = 'references';
    const key = `${toEntityId}::${type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ toEntityId, type });
  }
  return out;
}

/**
 * Compact volume/sensitivity hints — overview + NFR keywords; never dump sheet 10 raw.
 */
function buildDataHintSlice(pack) {
  const o = pack?.overview || {};
  const volume =
    normalizeVolume(o.expectedScale) ??
    normalizeVolume(o.expectedUsers) ??
    undefined;

  let sensitivity = '';
  const nfr = pack?.nonFunctionalRequirements || [];
  for (const row of nfr) {
    const blob = `${row.category || ''} ${row.requirement || ''} ${row.target || ''}`.toLowerCase();
    if (/pii|personal data|gdpr|privacy|confidential|secret|encrypt/.test(blob)) {
      sensitivity = 'confidential';
      break;
    }
    if (/internal|staff only|employee/.test(blob) && !sensitivity) {
      sensitivity = 'internal';
    }
    if (/public|open data/.test(blob) && !sensitivity) {
      sensitivity = 'public';
    }
  }
  return {
    volume,
    sensitivity: sensitivity || undefined,
  };
}

function inferSensitivityFromText(text, fallback) {
  const t = String(text || '').toLowerCase();
  if (/password|ssn|credit.?card|pii|secret|token|oauth/.test(t)) return 'confidential';
  if (/email|phone|address|profile|user.?data/.test(t)) return 'internal';
  return fallback || 'internal';
}

/** Noun-ish data entities hinted in FR prose. */
function inferEntityNamesFromSlice(slice) {
  const text = `${slice.title || ''} ${slice.description || ''} ${slice.ac || ''}`;
  const lower = text.toLowerCase();
  const found = [];
  const push = (name) => {
    if (found.some((n) => n.toLowerCase() === name.toLowerCase())) return;
    found.push(name);
  };

  const patterns = [
    [/\b(user|account|profile|session|credential|password)\b/, 'User'],
    [/\b(order|cart|checkout|invoice|payment|billing)\b/, 'Order'],
    [/\b(product|catalog|inventory|sku)\b/, 'Product'],
    [/\b(message|chat|notification|email|sms)\b/, 'Message'],
    [/\b(file|document|attachment|upload)\b/, 'Document'],
    [/\b(role|permission|rbac|grant)\b/, 'Role'],
    [/\b(report|analytics|dashboard|metric)\b/, 'Report'],
    [/\b(organization|company|tenant|workspace)\b/, 'Organization'],
    [/\b(task|ticket|issue|project)\b/, 'Task'],
  ];
  for (const [re, name] of patterns) {
    if (re.test(lower)) push(name);
  }
  if (!found.length) {
    const title = normProse(slice.title || slice.id).slice(0, NAME_MAX);
    if (title) push(title);
  }
  return found.slice(0, 3);
}

function inferAttributes(entityName, slice) {
  const attrs = [];
  const push = (a) => {
    if (attrs.length >= ATTR_MAX) return;
    attrs.push(a);
  };
  const n = entityName.toLowerCase();
  if (n.includes('user') || n.includes('account')) {
    push({ name: 'id', type: 'string' });
    push({ name: 'email', type: 'string' });
  } else if (n.includes('order')) {
    push({ name: 'id', type: 'string' });
    push({ name: 'status', type: 'string' });
    push({ name: 'total', type: 'number' });
  } else {
    push({ name: 'id', type: 'string' });
    if (slice.actor) push({ name: 'actor', type: 'string' });
  }
  return attrs;
}

/**
 * Normalize one entity; drop if missing name or (when packFrIds set) no valid relatedFrIds.
 * relatedCapabilityIds optional — filtered only when packCapabilityIds provided.
 */
function normalizeDataEntity(raw, packFrIds, packCapabilityIds, { index = 0 } = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const name = normProse(raw.name || raw.entity || raw.title || '').slice(0, NAME_MAX);
  if (!name) return null;

  let relatedFrIds = Array.isArray(raw.relatedFrIds)
    ? raw.relatedFrIds.map((id) => normId(id)).filter(Boolean)
    : [];
  if (Array.isArray(raw.sourceFrIds) && !relatedFrIds.length) {
    relatedFrIds = raw.sourceFrIds.map((id) => normId(id)).filter(Boolean);
  }
  if (packFrIds) {
    relatedFrIds = relatedFrIds.filter((id) => packFrIds.has(id));
  }
  relatedFrIds = [...new Set(relatedFrIds)];
  // Orphan / invented entity: no FR link when pack FR set is known
  if (packFrIds && !relatedFrIds.length) return null;

  let relatedCapabilityIds = Array.isArray(raw.relatedCapabilityIds)
    ? raw.relatedCapabilityIds.map((id) => normId(id) || normProse(id)).filter(Boolean)
    : [];
  if (packCapabilityIds) {
    relatedCapabilityIds = relatedCapabilityIds.filter((id) => packCapabilityIds.has(id));
  } else {
    // Job1: capability optional — do not invent; keep empty unless already empty-safe
    relatedCapabilityIds = [];
  }
  relatedCapabilityIds = [...new Set(relatedCapabilityIds)].slice(0, 16);

  let entityId = normProse(raw.entityId || raw.id || '').slice(0, 64);
  if (!entityId) {
    entityId = `ENT-${slugPart(name) || index + 1}`;
  }

  const crud = ensureCrudHasRead(normalizeCrud(raw.crud));
  const attributes = normalizeAttributes(raw.attributes);
  const source = truncate(raw.source || '', 120) || undefined;
  const consumers = normalizeConsumers(raw.consumers);
  const volume = normalizeVolume(raw.volume);
  const sensitivity = normalizeSensitivity(raw.sensitivity) || undefined;

  return {
    entityId,
    name,
    attributes,
    crud,
    ...(source ? { source } : {}),
    consumers,
    relationships: Array.isArray(raw.relationships) ? raw.relationships : [],
    ...(volume !== undefined ? { volume } : {}),
    ...(sensitivity ? { sensitivity } : {}),
    relatedFrIds,
    relatedCapabilityIds,
  };
}

function dedupeKey(name) {
  return normKey(name);
}

/**
 * Dedup by entity name; merge relatedFrIds / consumers / attributes / CRUD flags.
 */
function dedupeDataEntities(entities = []) {
  const map = new Map();
  for (const ent of entities) {
    if (!ent) continue;
    const key = dedupeKey(ent.name);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        ...ent,
        relatedFrIds: [...new Set(ent.relatedFrIds || [])],
        relatedCapabilityIds: [...new Set(ent.relatedCapabilityIds || [])],
        consumers: [...(ent.consumers || [])],
        attributes: [...(ent.attributes || [])],
        relationships: [...(ent.relationships || [])],
        crud: { ...ent.crud },
      });
      continue;
    }
    existing.relatedFrIds = [
      ...new Set([...(existing.relatedFrIds || []), ...(ent.relatedFrIds || [])]),
    ];
    existing.relatedCapabilityIds = [
      ...new Set([
        ...(existing.relatedCapabilityIds || []),
        ...(ent.relatedCapabilityIds || []),
      ]),
    ];
    existing.crud = {
      create: existing.crud.create || ent.crud.create,
      read: existing.crud.read || ent.crud.read,
      update: existing.crud.update || ent.crud.update,
      delete: existing.crud.delete || ent.crud.delete,
    };
    const attrSeen = new Set(
      existing.attributes.map((a) =>
        (typeof a === 'string' ? a : a.name || '').toLowerCase()
      )
    );
    for (const a of ent.attributes || []) {
      const n = (typeof a === 'string' ? a : a.name || '').toLowerCase();
      if (!n || attrSeen.has(n)) continue;
      attrSeen.add(n);
      existing.attributes.push(a);
      if (existing.attributes.length >= ATTR_MAX) break;
    }
    const consSeen = new Set(existing.consumers.map((c) => c.toLowerCase()));
    for (const c of ent.consumers || []) {
      const k = c.toLowerCase();
      if (consSeen.has(k)) continue;
      consSeen.add(k);
      existing.consumers.push(c);
      if (existing.consumers.length >= CONSUMERS_MAX) break;
    }
    if (!existing.sensitivity && ent.sensitivity) existing.sensitivity = ent.sensitivity;
    if (existing.volume == null && ent.volume != null) existing.volume = ent.volume;
    if (!existing.source && ent.source) existing.source = ent.source;
    existing.relationships = [...existing.relationships, ...(ent.relationships || [])];
  }
  return [...map.values()];
}

/**
 * Drop relationship edges / dataFlows that point to unknown entityIds (orphan refs).
 */
function dropOrphanRefs(entities = [], dataFlows = []) {
  const idSet = new Set(entities.map((e) => e.entityId).filter(Boolean));
  const cleanedEntities = entities.map((e) => ({
    ...e,
    relationships: normalizeRelationships(e.relationships, idSet),
  }));

  const flows = [];
  const seen = new Set();
  for (const flow of dataFlows || []) {
    if (!flow || typeof flow !== 'object') continue;
    const from = normId(flow.from || flow.fromEntityId || '');
    const to = normId(flow.to || flow.toEntityId || '');
    if (!from || !to) continue;
    if (!idSet.has(from) || !idSet.has(to)) continue;
    const via = truncate(flow.via || '', 80) || undefined;
    const key = `${from}->${to}::${via || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    flows.push(via ? { from, to, via } : { from, to });
  }
  return { entities: cleanedEntities, dataFlows: flows };
}

function extractEntitiesArray(data) {
  if (Array.isArray(data)) return { entities: data, dataFlows: [] };
  if (data && typeof data === 'object') {
    const entities = Array.isArray(data.entities)
      ? data.entities
      : Array.isArray(data.items)
        ? data.items
        : null;
    const dataFlows = Array.isArray(data.dataFlows)
      ? data.dataFlows
      : Array.isArray(data.flows)
        ? data.flows
        : [];
    if (!entities) return null;
    return { entities, dataFlows };
  }
  return null;
}

function validateAndNormalizeDataPayload(data, packFrIds, packCapabilityIds) {
  if (data == null || typeof data !== 'object') {
    const err = new Error('Data analysis response must be JSON object or array');
    err.code = 'DATA_NON_JSON';
    throw err;
  }
  const extracted = extractEntitiesArray(data);
  if (!extracted) {
    const err = new Error('Data JSON must include entities[]');
    err.code = 'DATA_INVALID_SHAPE';
    throw err;
  }
  const normalized = [];
  for (let i = 0; i < extracted.entities.length; i += 1) {
    const ent = normalizeDataEntity(extracted.entities[i], packFrIds, packCapabilityIds, {
      index: i,
    });
    if (ent) normalized.push(ent);
  }
  const deduped = dedupeDataEntities(normalized);
  return dropOrphanRefs(deduped, extracted.dataFlows);
}

/** Heuristic seed: entities from FR data hints + volume/sensitivity compact. */
function buildHeuristicDataEntities(frSlices = [], dataHints = {}) {
  const entities = [];
  let idx = 0;
  for (const slice of frSlices) {
    const names = inferEntityNamesFromSlice(slice);
    const text = `${slice.title || ''} ${slice.description || ''} ${slice.ac || ''}`;
    const crud = ensureCrudHasRead(crudFromText(text));
    const sensitivity =
      normalizeSensitivity(dataHints.sensitivity) ||
      inferSensitivityFromText(text, 'internal');
    for (const name of names) {
      entities.push({
        entityId: `ENT-H-${slugPart(name) || idx + 1}`,
        name,
        attributes: inferAttributes(name, slice),
        crud,
        source: slice.module || 'FR',
        consumers: slice.module ? [slice.module] : [],
        relationships: [],
        ...(dataHints.volume !== undefined ? { volume: dataHints.volume } : {}),
        sensitivity,
        relatedFrIds: [slice.id],
        relatedCapabilityIds: [],
      });
      idx += 1;
    }
  }
  return dropOrphanRefs(dedupeDataEntities(entities), []).entities;
}

function buildHeuristicDataFlows(entities = []) {
  const byName = new Map(entities.map((e) => [e.name.toLowerCase(), e]));
  const flows = [];
  const user = byName.get('user');
  const order = byName.get('order');
  const session = byName.get('session');
  if (user && order) flows.push({ from: user.entityId, to: order.entityId, via: 'api' });
  if (user && session) flows.push({ from: user.entityId, to: session.entityId, via: 'auth' });
  return dropOrphanRefs(entities, flows).dataFlows;
}

function buildDataChunks(frSlices, chunkSize = ENTITY_CHUNK_SIZE) {
  const chunks = [];
  for (let i = 0; i < frSlices.length; i += chunkSize) {
    chunks.push(frSlices.slice(i, i + chunkSize));
  }
  return chunks.slice(0, ENTITY_MAX_CHUNKS);
}

function buildDataPrompt({ context, dataHints, frChunk, chunkIndex, chunkTotal }) {
  return [
    'You are a software BA. Extract data entities and CRUD from requirements.',
    'Return ONLY valid JSON: {"entities":[{...}],"dataFlows":[{"from","to","via"?}]} — no markdown.',
    'Each entity fields: entityId, name, attributes (string[] or [{name,type}]),',
    'crud ({create,read,update,delete} booleans), source, consumers[],',
    'relationships ([{toEntityId,type}]), volume (string|number),',
    'sensitivity (public|internal|confidential|restricted|pii),',
    'relatedFrIds (FR ids from input only — never invent), relatedCapabilityIds (optional, often empty).',
    'Do not invent entities without a related FR. Cap attributes per entity.',
    `Chunk ${chunkIndex + 1}/${chunkTotal}.`,
    `Context: ${JSON.stringify(context)}`,
    `DataHints: ${JSON.stringify(dataHints)}`,
    `Requirements: ${JSON.stringify(frChunk)}`,
  ].join('\n');
}

function canStartChunk(elapsedMs, wallMs, chunkTimeoutMs) {
  return elapsedMs + chunkTimeoutMs <= wallMs;
}

/**
 * Run data analysis: LLM chunks + heuristic fill; drop orphan entities/flows.
 */
async function runDataAnalysis(pack, opts = {}) {
  const wallMs = opts.wallMs ?? ENTITY_WALL_MS;
  const started = Date.now();
  const packFrIds = buildFrIdSet(pack?.functionalRequirements || []);
  const packCapabilityIds = opts.packCapabilityIds || null;
  const frSlices = buildRequirementFrSlices(pack);
  const context = buildProjectContextSlice(pack);
  const dataHints = buildDataHintSlice(pack);
  const model = ollamaModel();

  if (!frSlices.length) {
    return {
      status: 'ready',
      model: null,
      generatedAt: new Date().toISOString(),
      entities: [],
      dataFlows: [],
      meta: { source: 'empty', llmCalls: 0, partial: false },
    };
  }

  const heuristicEntities = buildHeuristicDataEntities(frSlices, dataHints);
  const heuristicFlows = buildHeuristicDataFlows(heuristicEntities);
  const llmEnabled = isAiPlanningLlmEnabled() && opts.forceHeuristic !== true;

  if (!llmEnabled) {
    return {
      status: 'ready',
      model: null,
      generatedAt: new Date().toISOString(),
      entities: heuristicEntities,
      dataFlows: heuristicFlows,
      meta: { source: 'heuristic', llmCalls: 0, partial: false },
    };
  }

  const chunks = buildDataChunks(frSlices, opts.chunkSize || ENTITY_CHUNK_SIZE);
  const collectedEntities = [];
  const collectedFlows = [];
  let llmCalls = 0;
  let partial = false;
  let lastError = null;
  const chunkTimeout = opts.chunkTimeoutMs ?? Math.min(analysisChunkTimeoutMs(), wallMs);

  for (let i = 0; i < chunks.length; i += 1) {
    const elapsed = Date.now() - started;
    if (!canStartChunk(elapsed, wallMs, chunkTimeout)) {
      partial = true;
      lastError = 'wall_budget';
      break;
    }
    const prompt = buildDataPrompt({
      context,
      dataHints,
      frChunk: chunks[i],
      chunkIndex: i,
      chunkTotal: chunks.length,
    });
    const result = await generateJson({
      prompt,
      temperature: 0.1,
      timeoutMs: chunkTimeout,
      numPredict: ENTITY_NUM_PREDICT,
    });
    llmCalls += 1;
    if (result.skipped) {
      partial = true;
      lastError = result.error || 'llm_skipped';
      break;
    }
    if (!result.ok || result.data == null) {
      partial = true;
      lastError = result.error || 'ollama_error';
      continue;
    }
    try {
      const parsed = validateAndNormalizeDataPayload(
        result.data,
        packFrIds,
        packCapabilityIds
      );
      collectedEntities.push(...parsed.entities);
      collectedFlows.push(...parsed.dataFlows);
    } catch (err) {
      partial = true;
      lastError = err.code || 'DATA_INVALID';
    }
  }

  let entities = dedupeDataEntities(collectedEntities);
  let dataFlows = collectedFlows;
  if (!entities.length) {
    entities = heuristicEntities;
    dataFlows = heuristicFlows;
    partial = true;
    if (!lastError) lastError = 'fallback_heuristic';
  } else if (partial) {
    const covered = new Set(entities.flatMap((e) => e.relatedFrIds));
    const missingSlices = frSlices.filter((s) => !covered.has(s.id));
    if (missingSlices.length) {
      entities = dedupeDataEntities([
        ...entities,
        ...buildHeuristicDataEntities(missingSlices, dataHints),
      ]);
    }
  }

  const cleaned = dropOrphanRefs(entities, dataFlows);
  return {
    status: 'ready',
    model: llmCalls > 0 ? model : null,
    generatedAt: new Date().toISOString(),
    entities: cleaned.entities,
    dataFlows: cleaned.dataFlows,
    meta: {
      source: collectedEntities.length ? (partial ? 'llm_partial' : 'llm') : 'heuristic',
      llmCalls,
      partial,
      error: lastError || undefined,
      elapsedMs: Date.now() - started,
    },
  };
}

function applyDataToContainer(container, dataResult) {
  const next = { ...container, analyses: { ...container.analyses } };
  next.analyses.data = {
    status: dataResult.status || 'ready',
    model: dataResult.model || null,
    generatedAt: dataResult.generatedAt || new Date().toISOString(),
    items: [],
    entities: dataResult.entities || [],
    edges: [],
    dataFlows: dataResult.dataFlows || [],
    meta: dataResult.meta || {},
  };
  return next;
}

module.exports = {
  SENSITIVITY,
  ATTR_MAX,
  normalizeSensitivity,
  normalizeCrud,
  normalizeAttributes,
  normalizeVolume,
  normalizeDataEntity,
  dedupeDataEntities,
  dropOrphanRefs,
  validateAndNormalizeDataPayload,
  buildDataHintSlice,
  buildHeuristicDataEntities,
  buildHeuristicDataFlows,
  buildDataChunks,
  canStartChunk,
  runDataAnalysis,
  applyDataToContainer,
  extractEntitiesArray,
};
