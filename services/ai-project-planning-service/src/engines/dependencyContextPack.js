/**
 * Pack task / requirement / technical context for dependency LLM synthesizer.
 * Keep requirement text the synthesizer needs (statement, AC, cited FR first).
 */

const { clip } = require('./howSemanticLlm');
const { isLeafTask } = require('./dependencyFromSrs');

const DEFAULT_MAX_TASKS = 36;
const DEFAULT_MAX_FR = 28;
const DEFAULT_MAX_UC = 16;
const DEFAULT_MAX_AC_PER_FR = 6;
const DEFAULT_MAX_COMPONENTS = 20;

function listFrRows(pack = {}) {
  if (Array.isArray(pack.functionalRequirements)) return pack.functionalRequirements;
  if (Array.isArray(pack.frList)) return pack.frList;
  if (Array.isArray(pack.requirements)) return pack.requirements;
  return [];
}

function listUcRows(pack = {}) {
  if (Array.isArray(pack.useCases)) return pack.useCases;
  if (Array.isArray(pack.ucList)) return pack.ucList;
  return [];
}

function frId(row, index = 0) {
  return String(row?.externalId || row?.id || row?._id || `FR-${index + 1}`).trim();
}

function ucId(row, index = 0) {
  return String(row?.externalId || row?.ucKey || row?.id || `UC-${index + 1}`).trim();
}

function taskIdOf(task, index = 0) {
  return String(task?.id || task?.taskId || `TASK-${index + 1}`).trim();
}

function normalizeAcList(fr) {
  const raw = fr?.acceptanceCriteria || fr?.ac || fr?.acs || fr?.acceptance;
  if (Array.isArray(raw)) {
    return raw
      .map((a) => {
        if (typeof a === 'string') return clip(a, 140);
        return clip(a?.text || a?.statement || a?.description || '', 140);
      })
      .filter(Boolean)
      .slice(0, DEFAULT_MAX_AC_PER_FR);
  }
  if (typeof raw === 'string' && raw.trim()) {
    return raw
      .split(/\n|;/)
      .map((s) => clip(s, 140))
      .filter(Boolean)
      .slice(0, DEFAULT_MAX_AC_PER_FR);
  }
  return [];
}

function buildTaskContext(tasks = [], { maxTasks = DEFAULT_MAX_TASKS } = {}) {
  return (tasks || [])
    .filter((t) => t && isLeafTask(t))
    .slice(0, maxTasks)
    .map((t, i) => ({
      id: taskIdOf(t, i),
      name: clip(t.name || t.title, 100),
      description: clip(t.description || t.summary || '', 240),
      deliverable: clip(t.deliverable || t.output || '', 160),
      completionCondition: clip(
        t.doneWhen || t.completionCondition || t.acceptanceCriteria || '',
        120
      ),
      area: clip(t.area, 24),
      role: clip(t.suggestedRoleKey || t.role, 32),
      sourceFrIds: (t.sourceFrIds || []).map(String).slice(0, 6),
      sourceUcIds: (t.sourceUcIds || []).map(String).slice(0, 4),
      acRefs: (t.acRefs || []).map((a) => clip(a, 80)).slice(0, 4),
    }))
    .filter((t) => t.id);
}

function citedFrIdsFromTasks(tasks = []) {
  const ids = new Set();
  for (const task of tasks || []) {
    if (!task || !isLeafTask(task)) continue;
    for (const id of task.sourceFrIds || []) {
      const n = String(id || '').trim();
      if (n) ids.add(n);
    }
  }
  return ids;
}

function orderRowsByCitedIds(rows, cited, idOf) {
  const tagged = rows.map((row, index) => ({ row, id: idOf(row, index) }));
  if (!cited || cited.size === 0) return tagged;
  const preferred = [];
  const rest = [];
  for (const item of tagged) {
    if (cited.has(item.id)) preferred.push(item);
    else rest.push(item);
  }
  return preferred.concat(rest);
}

function buildRequirementContext(
  pack = {},
  { maxFr = DEFAULT_MAX_FR, maxUc = DEFAULT_MAX_UC, citedFrIds = null } = {}
) {
  const frs = orderRowsByCitedIds(listFrRows(pack), citedFrIds, frId)
    .slice(0, maxFr)
    .map(({ row, id }) => ({
      id,
      title: clip(row.title || row.name || row.statement, 120),
      statement: clip(row.statement || row.description || row.detail || '', 280),
      acceptanceCriteria: normalizeAcList(row),
      dependsOn: Array.isArray(row.dependsOn)
        ? row.dependsOn.map((d) => String(d?.id || d || '').trim()).filter(Boolean).slice(0, 6)
        : [],
    }));

  const ucs = listUcRows(pack)
    .slice(0, maxUc)
    .map((uc, i) => ({
      id: ucId(uc, i),
      title: clip(uc.title || uc.name, 120),
      summary: clip(uc.summary || uc.description || '', 200),
    }));

  return { frs, ucs };
}

function extractArchitectureHints(container = {}) {
  const arch = container?.analyses?.architecture || {};
  const components = Array.isArray(arch.components)
    ? arch.components
    : Array.isArray(arch.entities)
      ? arch.entities
      : [];
  const edges = Array.isArray(arch.edges) ? arch.edges : [];
  const contracts = [];

  for (const c of components.slice(0, DEFAULT_MAX_COMPONENTS)) {
    const name = clip(c.name || c.id || c.key, 60);
    const kind = clip(c.kind || c.type || c.layer, 32);
    const apiHint = clip(
      c.apiContract || c.contract || c.interface || c.endpoint || '',
      100
    );
    if (name) {
      contracts.push({
        componentId: String(c.id || c.key || name),
        name,
        kind,
        apiContract: apiHint || null,
      });
    }
  }

  const integrationEdges = edges.slice(0, 24).map((e) => ({
    from: String(e.from || e.source || ''),
    to: String(e.to || e.target || ''),
    kind: clip(e.kind || e.type || '', 32),
  }));

  return { components: contracts, integrationEdges };
}

function buildTechnicalContext(container = {}, pack = {}) {
  const { components, integrationEdges } = extractArchitectureHints(container);
  const techNotes = clip(
    pack.technicalNotes ||
      pack.overview?.technicalConstraints ||
      pack.architectureNotes ||
      '',
    400
  );
  const hasApiContractHint =
    components.some((c) => c.apiContract) ||
    /api\s*contract|openapi|swagger|endpoint/i.test(techNotes);

  return {
    components,
    integrationEdges,
    techNotes: techNotes || null,
    hasApiContractHint,
    missingTechnicalHints: !hasApiContractHint && components.length === 0 && !techNotes,
  };
}

/**
 * @returns {{ task: object[], requirement: object, technical: object, meta: object }}
 */
function requirementFromCompiled(compiled) {
  const frs = [];
  const ucs = [];
  const seenFr = new Set();
  const seenUc = new Set();
  for (const unit of compiled.workUnits || []) {
    for (const row of unit.entities?.functionalRequirements || []) {
      if (seenFr.has(row.entityId)) continue;
      seenFr.add(row.entityId);
      frs.push({
        id: row.entityId,
        title: row.content?.title || '',
        statement: row.content?.description || '',
        acceptanceCriteria: (row.content?.acceptanceCriteria || []).map((item) => item.text).filter(Boolean),
        dependsOn: [],
      });
    }
    for (const row of unit.entities?.useCases || []) {
      if (seenUc.has(row.entityId)) continue;
      seenUc.add(row.entityId);
      ucs.push({
        id: row.entityId,
        title: row.content?.title || '',
        summary: row.content?.description || '',
      });
    }
  }
  return { frs, ucs };
}

function buildDependencyContextPack(container = {}, pack = {}, opts = {}) {
  const { compileContext } = require('../dataPlane/compileContext');
  const tasks = Array.isArray(container?.planning?.tasks) ? container.planning.tasks : [];
  const task = buildTaskContext(tasks, opts);
  const compiled = compileContext({
    phase: 'HOW',
    profile: 'DEPENDENCY_TASK_SET',
    pack,
    container,
    focusRefs: opts.focusRefs,
    budget: opts.budget,
  });
  const requirement = requirementFromCompiled(compiled);
  const technical = buildTechnicalContext(container, pack);

  return {
    task,
    requirement,
    technical,
    meta: {
      taskCount: task.length,
      frCount: requirement.frs.length,
      ucCount: requirement.ucs.length,
      componentCount: technical.components.length,
      missingTechnicalHints: Boolean(technical.missingTechnicalHints),
      contextStatus: compiled.status,
      coverage: compiled.coverage,
    },
  };
}

module.exports = {
  buildDependencyContextPack,
  buildTaskContext,
  buildRequirementContext,
  buildTechnicalContext,
  clip,
};
