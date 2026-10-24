/**
 * Architecture Semantic Context — real SNAP/pack/upstream only (no mock).
 */

const { clip, getMissingSemanticSlots } = require('./architectureSchema');
const { compileContext } = require('../../dataPlane/compileContext');

function frBriefFromPack(pack = {}, citedFrIds = null, container = null) {
  const cited = citedFrIds instanceof Set ? [...citedFrIds] : [];
  const compiled = compileContext({
    phase: 'HOW',
    profile: 'ARCHITECTURE_IMPACT',
    pack,
    container: container || {},
    focusRefs: cited,
  });
  const brief = [];
  const seen = new Set();
  for (const unit of compiled.workUnits || []) {
    for (const row of unit.entities?.functionalRequirements || []) {
      if (seen.has(row.entityId)) continue;
      seen.add(row.entityId);
      const item = {
        id: row.entityId,
        title: row.content?.title || '',
        statement: row.content?.description || '',
      };
      if (row.content?.moduleId) item.module = row.content.moduleId;
      if (row.content?.feature) item.feature = row.content.feature;
      const ac = (row.content?.acceptanceCriteria || []).map((entry) => entry.text).filter(Boolean);
      if (ac.length) item.ac = ac;
      if (item.id && (item.title || item.statement)) brief.push(item);
    }
  }
  return brief;
}

function capabilityBriefFromContainer(container = {}) {
  const rows = container?.analyses?.capability?.items || [];
  return rows.map((c) => ({
    id: String(c.capabilityId || c.id || '').trim() || null,
    name: clip(c.name || c.capabilityId, 100),
    complexity: c.complexity || null,
    sourceFrIds: Array.isArray(c.sourceFrIds) ? c.sourceFrIds.map(String) : [],
  })).filter((r) => r.id || r.name);
}

function wbsLeafBrief(container = {}) {
  return (container?.planning?.tasks || [])
    .filter((t) => {
      const level = String(t?.level || 'task').toLowerCase();
      return level === 'task' || level === 'subtask' || !t.level;
    })
    .map((t) => {
      const description = String(t.description || t.summary || '').trim();
      return {
        id: String(t.id || t.taskId || '').trim(),
        title: clip(t.name || t.title, 100),
        ...(description ? { description } : {}),
        area: clip(t.area, 24),
        sourceFrIds: Array.isArray(t.sourceFrIds) ? t.sourceFrIds.map(String) : [],
      };
    })
    .filter((t) => t.id);
}

function systemFromPackAndToolData(pack = {}, toolData = {}, snapshot = null) {
  const technical =
    pack.technical ||
    snapshot?.projected?.technical ||
    snapshot?.canonical?.technical ||
    toolData.technical ||
    {};
  const catalog = Array.isArray(pack.architectureCatalog)
    ? pack.architectureCatalog
    : Array.isArray(pack.technology)
      ? pack.technology
      : Array.isArray(snapshot?.projected?.technology)
        ? snapshot.projected.technology
        : [];
  const environments = Array.isArray(technical.environments)
    ? technical.environments.map((e) => (typeof e === 'string' ? e : e?.name || e?.key)).filter(Boolean)
    : [];
  return {
    architectureCatalog: catalog
      .map((t, i) => ({
        name: clip(typeof t === 'string' ? t : t?.name, 80),
        layer: clip(typeof t === 'object' ? t.layer || t.category : '', 32),
        source: 'pack_or_snapshot',
        index: i,
      }))
      .filter((t) => t.name),
    technology: catalog.length
      ? undefined
      : undefined,
    environments,
    hasTechnical: Boolean(technical && Object.keys(technical).length),
  };
}

/**
 * @returns {{ ok: boolean, semantic: object|null, missingSlots: string[], openQuestions: object[] }}
 */
function buildArchitectureSemantic({
  pack = {},
  container = {},
  toolData = {},
  snapshot = null,
  env = process.env,
} = {}) {
  const {
    normalizeDeriveLocale,
  } = require('../../semantic/buildSemanticDeriveContext');
  const locale = normalizeDeriveLocale(
    pack?.aiAnalysis?.deriveLocale || pack?.locale || env.PHASE1_DERIVE_LOCALE
  );

  const citedFrIds = new Set();
  for (const task of container?.planning?.tasks || []) {
    for (const id of task?.sourceFrIds || []) {
      const n = String(id || '').trim();
      if (n) citedFrIds.add(n);
    }
  }
  const frBrief = frBriefFromPack(pack, citedFrIds, container);
  const capabilityBrief = capabilityBriefFromContainer(container);
  const leafBrief = wbsLeafBrief(container);
  const system = systemFromPackAndToolData(pack, toolData, snapshot);

  const openQuestions = [];
  if (!frBrief.length && !capabilityBrief.length) {
    openQuestions.push({
      code: 'ARCH_NO_FR_OR_CAPABILITY',
      message: 'Thiếu FR Gate1 hoặc capability upstream — không đề xuất kiến trúc ảo.',
    });
  }
  if (!system.architectureCatalog.length && !system.environments.length) {
    openQuestions.push({
      code: 'ARCH_NO_TECH_CATALOG',
      message: 'Chưa có architectureCatalog/technology/environments trên pack/SNAP.',
    });
  }

  const semantic = {
    business: {
      projectName: clip(pack.overview?.name || pack.name || pack.overview?.requirementName, 80),
      locale,
      frBrief,
    },
    system,
    upstream: {
      capabilityBrief,
      wbsLeafBrief: leafBrief,
      gapBrief: (container?.analyses?.gap?.items || []).map((g) => ({
        gapId: String(g.gapId || g.id || '').trim() || null,
        type: g.type || null,
        issue: clip(g.issue || g.missingTarget, 120),
        relatedFrIds: Array.isArray(g.relatedFrIds) ? g.relatedFrIds.map(String) : [],
      })),
    },
  };

  const missingSlots = getMissingSemanticSlots(semantic);
  return {
    ok: missingSlots.length === 0,
    semantic: missingSlots.length ? semantic : semantic,
    missingSlots,
    openQuestions,
    allowLists: {
      frIds: frBrief.map((f) => f.id).filter(Boolean),
      capabilityIds: capabilityBrief.map((c) => c.id).filter(Boolean),
      taskIds: leafBrief.map((t) => t.id).filter(Boolean),
      catalogNames: system.architectureCatalog.map((c) => c.name),
    },
  };
}

module.exports = {
  buildArchitectureSemantic,
  frBriefFromPack,
  capabilityBriefFromContainer,
};
