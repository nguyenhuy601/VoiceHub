/**
 * Context pack for Quality / Test Case LLM.
 * Only fields present on the approved pack are copied. Ids stay verbatim.
 */

const { normalizeDeriveLocale } = require('../../semantic/buildSemanticDeriveContext');

function clip(s, max = 160) {
  const t = String(s || '').trim().replace(/\s+/g, ' ');
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

function asList(value) {
  if (Array.isArray(value)) return value.filter((row) => row && typeof row === 'object');
  if (Array.isArray(value?.items)) return value.items.filter((row) => row && typeof row === 'object');
  if (Array.isArray(value?.rows)) return value.rows.filter((row) => row && typeof row === 'object');
  return [];
}

function idOf(row, keys, fallback) {
  for (const key of keys) {
    const value = String(row?.[key] || '').trim();
    if (value) return value;
  }
  return fallback;
}

function acceptanceLines(row, maxItems = 6, maxChars = 160) {
  const raw =
    row?.acceptanceCriteriaList ||
    row?.acceptanceCriteria ||
    row?.ac ||
    row?.acs ||
    row?.acceptance;
  const lines = [];
  const push = (text) => {
    const c = clip(text, maxChars);
    if (c) lines.push(c);
  };
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (lines.length >= maxItems) break;
      if (typeof item === 'string') push(item);
      else push(item?.text || item?.statement || item?.description || '');
    }
  } else if (typeof raw === 'string' && raw.trim()) {
    for (const part of raw.split(/\n|;/)) {
      if (lines.length >= maxItems) break;
      push(part);
    }
  }
  return lines;
}

function flowText(value, max = 360) {
  if (!value) return '';
  if (typeof value === 'string') return clip(value, max);
  if (!Array.isArray(value)) return '';
  const parts = [];
  for (const item of value) {
    if (parts.length >= 8) break;
    if (typeof item === 'string') {
      const text = clip(item, 120);
      if (text) parts.push(text);
    } else if (item && typeof item === 'object') {
      const text = clip(item.action || item.step || item.description || item.text || '', 120);
      if (text) parts.push(text);
    }
  }
  return clip(parts.join(' → '), max);
}

function idList(row, keys) {
  const out = [];
  for (const key of keys) {
    const raw = row?.[key];
    const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
    for (const item of values) {
      const id = String(item?.id || item || '').trim();
      if (id && !out.includes(id)) out.push(id);
    }
  }
  return out.slice(0, 8);
}

function briefUseCase(row, index) {
  const id = idOf(row, ['externalId', 'ucKey', 'id'], `UC-${index + 1}`);
  const title = clip(row.title || row.name, 120);
  const statement = clip(row.statement || row.description || row.goal || row.summary || '', 320);
  const actor = clip(row.primaryActor || row.actor || (Array.isArray(row.actors) ? row.actors[0] : ''), 80);
  const mainFlow = flowText(row.mainFlow || row.basicFlow || row.flow || row.businessSteps);
  const alternateFlows = flowText(row.alternateFlows || row.alternativeFlows || row.altFlows);
  const exceptionFlows = flowText(row.exceptionFlows || row.exceptions || row.exceptionFlow);
  const preconditions = clip(row.preconditions || row.precondition || '', 200);
  const postconditions = clip(row.postconditions || row.postcondition || '', 200);
  const ac = acceptanceLines(row, 4, 160);
  const relatedFrIds = idList(row, ['relatedFrIds', 'frIds', 'sourceFrIds']);
  const out = { id };
  if (title) out.title = title;
  if (statement && statement !== title) out.statement = statement;
  if (actor) out.actor = actor;
  if (mainFlow) out.mainFlow = mainFlow;
  if (alternateFlows) out.alternateFlows = alternateFlows;
  if (exceptionFlows) out.exceptionFlows = exceptionFlows;
  if (preconditions) out.preconditions = preconditions;
  if (postconditions) out.postconditions = postconditions;
  if (ac.length) out.ac = ac;
  if (relatedFrIds.length) out.relatedFrIds = relatedFrIds;
  return out;
}

function briefFr(row, index) {
  const id = idOf(row, ['externalId', 'id'], `FR-${index + 1}`);
  const title = clip(row.title || row.name || row.statement, 120);
  const statement = clip(row.statement || row.description || row.detail || row.summary || '', 360);
  const moduleName = clip(row.module || row.moduleName || '', 60);
  const feature = clip(row.feature || row.featureName || '', 60);
  const priority = clip(row.priority || '', 24);
  const ac = acceptanceLines(row, 6, 160);
  const relatedUcKeys = idList(row, ['relatedUcKeys', 'useCaseIds', 'ucKeys']);
  const out = { id };
  if (title) out.title = title;
  if (statement && statement !== title) out.statement = statement;
  if (moduleName) out.module = moduleName;
  if (feature && feature !== moduleName) out.feature = feature;
  if (priority) out.priority = priority;
  if (ac.length) out.ac = ac;
  if (relatedUcKeys.length) out.relatedUcKeys = relatedUcKeys;
  return out;
}

function briefRule(row, index) {
  const id = idOf(row, ['externalId', 'brId', 'logicalId', 'id'], `BR-${index + 1}`);
  const title = clip(row.title || row.name, 120);
  const statement = clip(row.statement || row.description || row.text || row.rule || '', 320);
  const relatedFrIds = idList(row, ['relatedFrIds', 'frIds', 'sourceFrIds']);
  const out = { id };
  if (title) out.title = title;
  if (statement && statement !== title) out.statement = statement;
  if (relatedFrIds.length) out.relatedFrIds = relatedFrIds;
  return out;
}

function briefNfr(row, index) {
  const id = idOf(row, ['externalId', 'nfrId', 'id'], `NFR-${index + 1}`);
  const title = clip(row.requirement || row.name || row.title, 120);
  const statement = clip(row.statement || row.description || row.detail || '', 320);
  const category = clip(row.category || row.type || '', 40);
  const metric = clip(row.metric || row.measure || row.kpi || '', 80);
  const threshold = clip(row.threshold || row.target || row.sla || row.value || '', 80);
  const out = { id };
  if (title) out.title = title;
  if (statement && statement !== title) out.statement = statement;
  if (category) out.category = category;
  if (metric) out.metric = metric;
  if (threshold) out.threshold = threshold;
  return out;
}

function briefInterface(row, index) {
  const id = idOf(row, ['externalId', 'logicalId', 'id'], `API-${index + 1}`);
  const title = clip(row.title || row.name, 120);
  const statement = clip(row.description || row.statement || row.detail || '', 280);
  const protocol = clip(row.protocol || row.method || '', 40);
  const direction = clip(row.direction || '', 40);
  const out = { id };
  if (title) out.title = title;
  if (statement) out.statement = statement;
  if (protocol) out.protocol = protocol;
  if (direction) out.direction = direction;
  return out;
}

async function buildQualitySemantic({ pack = {}, container = {}, toolData = {}, snapshot = null, env = process.env, contextPackage = null, snapshotId = null } = {}) {
  const {
    assembleHowToolContext,
    slimLayer,
    contextAllowsWork,
    missingSlotsFor,
  } = require('../../semanticLayer/howToolContext');
  const locale = normalizeDeriveLocale(
    pack?.aiAnalysis?.deriveLocale || pack?.locale || env.PHASE1_DERIVE_LOCALE
  );
  const layer = await assembleHowToolContext({
    purpose: 'QUALITY',
    pack,
    container,
    toolData,
    snapshot,
    snapshotId,
    contextPackage,
    env,
  });
  const useCases = layer.requiredData?.useCases || [];
  const frs = layer.requiredData?.functionalRequirements || [];
  const nfrs = layer.requiredData?.nfrs || [];
  const businessRules = layer.requiredData?.businessRules || [];
  const interfaces = layer.requiredData?.interfaces || [];
  const technical = pack.technical || snapshot?.projected?.technical || toolData.technical || {};
  const environments = Array.isArray(technical.environments)
    ? technical.environments
        .map((item) => (typeof item === 'string' ? item : item?.name || item?.key))
        .filter(Boolean)
    : [];
  const missingSlots = missingSlotsFor('QUALITY', layer);
  if (!locale) missingSlots.push('business.locale');
  const openQuestions = [];
  if (!environments.length) {
    openQuestions.push({
      code: 'QUAL_NO_ENV_SNAP',
      message: 'Chưa có technical.environments trên SNAP/pack — không hardcode env.',
    });
  }
  return {
    ok: contextAllowsWork(layer) && missingSlots.length === 0,
    missingSlots,
    openQuestions,
    allowLists: {
      ucKeys: useCases.map((row) => row.id),
      frIds: frs.map((row) => row.id),
      nfrIds: nfrs.map((row) => row.id),
      brIds: businessRules.map((row) => row.id),
      apiIds: interfaces.map((row) => row.id),
      environments,
    },
    semantic: {
      business: {
        locale,
        projectName: clip(pack.overview?.name || pack.name, 80),
        useCases,
        frs,
        nfrs,
        businessRules,
      },
      system: { environments, interfaces },
      upstream: {
        wbsTaskCount: (container?.planning?.tasks || []).length,
      },
      layer: slimLayer(layer),
    },
  };
}

module.exports = { buildQualitySemantic };
