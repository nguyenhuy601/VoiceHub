/**
 * HOW phase context port.
 * Required rows come from the approved pack and the current run.
 * Retrieved citations are optional search hits only.
 */

const { assembleContext } = require('./assembleContext');

const SLOT_BY_PURPOSE = Object.freeze({
  WBS_GENERATION: 'stories',
  BACKLOG: 'stories',
  DEPENDENCY: 'upstream.taskBrief',
  RISK: 'upstream.triggers_or_fr',
  QUALITY: 'business.uc_or_fr',
  SCHEDULE_TEXT: 'tasks',
  SPRINT: 'upstream.sprints',
  RELEASES: 'upstream.scheduleWindows',
});

function clip(value, max = 320) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  if (!text) return '';
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

function rowId(row, keys, fallback) {
  for (const key of keys) {
    const value = String(row?.[key] || '').trim();
    if (value) return value;
  }
  return fallback;
}

function asList(value) {
  if (Array.isArray(value)) return value.filter((row) => row && typeof row === 'object');
  if (Array.isArray(value?.items)) return value.items.filter((row) => row && typeof row === 'object');
  return [];
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
  return out;
}

function acceptanceLines(row) {
  const raw = row?.acceptanceCriteriaList || row?.acceptanceCriteria || row?.ac || row?.acs;
  const lines = [];
  const push = (text) => {
    const value = clip(text, 160);
    if (value) lines.push(value);
  };
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === 'string') push(item);
      else push(item?.text || item?.statement || item?.description || '');
    }
  } else if (typeof raw === 'string') {
    for (const part of raw.split(/\n|;/)) push(part);
  }
  return lines;
}

function runScope(pack = {}, snapshot = null) {
  return {
    organizationId: String(pack.organizationId || snapshot?.organizationId || 'local-org'),
    projectId: String(pack.projectId || pack.id || snapshot?.projectId || 'local-project'),
  };
}

function stamp(scope, fields) {
  return {
    organizationId: scope.organizationId,
    projectId: scope.projectId,
    versionId: 'v1',
    lifecycleStatus: 'ACTIVE',
    reviewStatus: 'APPROVED',
    scope: 'project',
    blocking: true,
    contradicts: [],
    role: 'definition',
    ...fields,
    entityId: fields.entityId || fields.id,
  };
}

function storyRows(opts) {
  if (Array.isArray(opts.stories) && opts.stories.length) return opts.stories;
  const backlog = opts.container?.planning?.backlog;
  if (Array.isArray(backlog?.stories)) return backlog.stories;
  if (Array.isArray(opts.pack?.stories)) return opts.pack.stories;
  return [];
}

function buildCatalog(opts, scope) {
  const pack = opts.pack || {};
  const container = opts.container || {};
  const { buildCanonicalStore } = require('../dataPlane/canonicalStore');
  const store = buildCanonicalStore({
    pack,
    snapshot: opts.snapshot,
    container,
    stories: storyRows(opts),
    understanding: pack?.aiAnalysis?.requirementUnderstanding || null,
  });
  const frs = store.entities
    .filter((row) => row.entityType === 'functional_requirement')
    .map((row) =>
      stamp(scope, {
        id: row.entityId,
        text: row.content.description || row.content.title,
        title: row.content.title,
        statement: row.content.description,
        module: row.content.moduleId || undefined,
        feature: row.content.feature || undefined,
        ac: (row.content.acceptanceCriteria || []).map((item) => item.text),
        relatedUcKeys: row.content.relatedUcIds || [],
        sourceFrIds: [row.entityId],
      })
    );

  const stories = store.entities
    .filter((row) => row.entityType === 'story')
    .map((row) =>
      stamp(scope, {
        id: row.entityId,
        text: row.content.title,
        description: row.content.description,
        sourceFrIds: row.content.sourceFrIds || [],
        ac: (row.content.acceptanceCriteria || []).map((item) => item.text),
      })
    );

  const acceptanceCriteria = [];
  for (const fr of frs) {
    (fr.ac || []).forEach((line, index) => {
      acceptanceCriteria.push(
        stamp(scope, {
          id: `${fr.id}:ac:${index + 1}`,
          entityId: fr.id,
          text: line,
          sourceFrIds: [fr.id],
        })
      );
    });
  }

  const useCases = asList(pack.useCases).map((row, index) =>
    stamp(scope, {
      id: rowId(row, ['externalId', 'ucKey', 'id'], `UC-${index + 1}`),
      title: clip(row.title || row.name, 120),
      text: clip(row.statement || row.description || row.goal, 320),
      mainFlow: clip(
        typeof row.mainFlow === 'string' ? row.mainFlow : '',
        360
      ),
      relatedFrIds: idList(row, ['relatedFrIds', 'frIds', 'sourceFrIds']),
    })
  );

  const nfrs = asList(pack.nonFunctionalRequirements).map((row, index) =>
    stamp(scope, {
      id: rowId(row, ['externalId', 'nfrId', 'id'], `NFR-${index + 1}`),
      title: clip(row.requirement || row.name || row.title, 120),
      text: clip(row.statement || row.description, 320),
      threshold: clip(row.threshold || row.target || row.value, 80),
    })
  );

  const businessRules = asList(pack.businessRules).map((row, index) =>
    stamp(scope, {
      id: rowId(row, ['externalId', 'brId', 'id'], `BR-${index + 1}`),
      title: clip(row.title || row.name, 120),
      text: clip(row.statement || row.description || row.text, 320),
      relatedFrIds: idList(row, ['relatedFrIds', 'frIds']),
    })
  );

  const interfaces = asList(pack.interfaces).map((row, index) =>
    stamp(scope, {
      id: rowId(row, ['externalId', 'id'], `API-${index + 1}`),
      title: clip(row.title || row.name, 120),
      text: clip(row.description || row.statement, 280),
      protocol: clip(row.protocol || row.method, 40),
    })
  );

  // Leaf tasks first so DEPENDENCY admission under budget keeps endpoints, not only Epic/Story.
  const tasksRaw = asList(container?.planning?.tasks);
  const isLeafLevel = (level) => {
    const token = String(level || 'task').toLowerCase();
    return token === 'task' || token === 'subtask' || !level;
  };
  const tasksOrdered = [
    ...tasksRaw.filter((task) => isLeafLevel(task?.level)),
    ...tasksRaw.filter((task) => !isLeafLevel(task?.level)),
  ];
  const tasks = tasksOrdered.map((task, index) =>
    stamp(scope, {
      id: rowId(task, ['id', 'taskId'], `TASK-${index + 1}`),
      reviewStatus: 'RUN',
      scope: 'run',
      title: String(task.name || task.title || '').trim(),
      text: String(task.description || task.summary || task.name || '').trim(),
      description: String(task.description || task.summary || '').trim(),
      deliverable: String(task.deliverable || task.output || '').trim(),
      area: clip(task.area, 24),
      dependsOn: Array.isArray(task.dependsOn) ? task.dependsOn.map(String) : [],
      sourceFrIds: Array.isArray(task.sourceFrIds) ? task.sourceFrIds.map(String) : [],
      durationHours: Number(task.effortHours) > 0 ? Number(task.effortHours) : undefined,
      level: task.level || 'task',
    })
  );

  const dependencies = [];
  for (const task of tasks) {
    for (const to of task.dependsOn || []) {
      dependencies.push(
        stamp(scope, {
          id: `${task.id}>${to}`,
          reviewStatus: 'RUN',
          scope: 'run',
          text: `${task.id} depends on ${to}`,
          from: task.id,
          to,
        })
      );
    }
  }

  const durations = tasks
    .filter((task) => task.durationHours != null)
    .map((task) =>
      stamp(scope, {
        id: `${task.id}:duration`,
        entityId: task.id,
        reviewStatus: 'RUN',
        scope: 'run',
        text: String(task.durationHours),
        durationHours: task.durationHours,
      })
    );

  const caps = asList(container?.analyses?.capability?.items)
    .filter((row) => String(row.complexity || '').toLowerCase() === 'high')
    .map((row) =>
      stamp(scope, {
        id: rowId(row, ['capabilityId', 'id'], ''),
        kind: 'highCapability',
        name: clip(row.name, 80),
        text: clip(row.name, 80),
        sourceFrIds: row.sourceFrIds || [],
      })
    )
    .filter((row) => row.id);
  const gaps = asList(container?.analyses?.gap?.items)
    .filter((row) => ['high', 'critical'].includes(String(row.severity || '').toLowerCase()))
    .map((row, index) =>
      stamp(scope, {
        id: rowId(row, ['id', 'gapId'], `GAP-${index + 1}`),
        kind: 'gap',
        text: clip(row.title || row.name || row.description, 160),
      })
    );
  const archHigh = asList(container?.analyses?.architectureImpact?.items)
    .filter((row) => String(row.impactLevel || '').toLowerCase() === 'high')
    .map((row, index) =>
      stamp(scope, {
        id: rowId(row, ['id'], `ARCH-${index + 1}`),
        kind: 'archHigh',
        text: clip(row.title || row.name, 160),
      })
    );
  const blockingDeps = asList(container?.analyses?.dependency?.edges)
    .filter((row) => row.blocking || row.critical)
    .map((row, index) =>
      stamp(scope, {
        id: rowId(row, ['id'], `BDEP-${index + 1}`),
        kind: 'blockingDep',
        reviewStatus: 'RUN',
        scope: 'run',
        text: clip(`${row.from || ''} -> ${row.to || ''}`, 80),
      })
    );

  const schedulePlan = container?.planning?.schedulePlan || {};
  const sprints = asList(schedulePlan.sprints).map((row) =>
    stamp(scope, {
      id: String(row.id || ''),
      reviewStatus: 'RUN',
      scope: 'run',
      text: clip(row.name, 80),
      startDate: row.startDate || null,
      endDate: row.endDate || null,
      effortHours: row.effortHours,
      taskCount: Array.isArray(row.taskIds) ? row.taskIds.length : 0,
    })
  ).filter((row) => row.id);
  const releases = asList(schedulePlan.releases).map((row) =>
    stamp(scope, {
      id: String(row.id || ''),
      reviewStatus: 'RUN',
      scope: 'run',
      text: clip(row.name, 80),
      startDate: row.startDate || null,
      estimatedEnd: row.estimatedEnd || row.endDate || null,
      effortHours: row.effortHours,
    })
  ).filter((row) => row.id);

  const roleKeys = Array.isArray(opts.toolData?.enabledProjectRoleKeys)
    ? opts.toolData.enabledProjectRoleKeys
    : Array.isArray(pack.enabledProjectRoleKeys)
      ? pack.enabledProjectRoleKeys
      : [];
  const roles = roleKeys.map((key) =>
    stamp(scope, {
      id: String(key),
      text: String(key),
      scope: 'organization',
    })
  );

  return {
    story: stories,
    functionalRequirements: frs,
    acceptanceCriteria,
    useCases,
    nfrs,
    businessRules,
    interfaces,
    tasks,
    durations,
    dependencies,
    roles,
    triggers: [...caps, ...gaps, ...archHigh, ...blockingDeps],
    sprints,
    releases,
    coefficients: [],
    toolResult: [],
    annotations: store.annotations,
  };
}

function citationHits(contextPackage, scope) {
  const rows = Array.isArray(contextPackage?.citations)
    ? contextPackage.citations
    : Array.isArray(contextPackage?.docs)
      ? contextPackage.docs
      : [];
  return rows
    .map((row, index) =>
      stamp(scope, {
        id: `cite-${row.sourceId || row.id || index}`,
        text: clip(row.snippet || row.text, 240),
        role: 'definition',
        sourceRecordId: row.sourceId || row.id || null,
      })
    )
    .filter((row) => row.text);
}

function slimLayer(layer) {
  if (!layer?.ok) return null;
  return {
    status: layer.status,
    requiredData: layer.requiredData,
    supportingContext: layer.supportingContext,
    unresolvedIssues: layer.unresolvedIssues,
    allowedEntityIds: layer.allowedEntityIds,
    coverage: layer.coverage,
  };
}

function contextAllowsWork(layer) {
  return Boolean(layer?.ok && (layer.status === 'READY' || layer.status === 'OVER_BUDGET'));
}

/**
 * Narrow planning.tasks to semantic-layer admission ids — never wipe a non-empty
 * WBS when the layer admitted zero ids or id mismatch filtered everything out
 * (Schedule/ProjectPlan previously wrote tasks:[] → Gate2 empty after good WbsTool).
 * @param {object} container
 * @param {object} layer — assembleHowToolContext result
 * @returns {object}
 */
function scopeContainerTasksByContext(container, layer) {
  const sourceTasks = Array.isArray(container?.planning?.tasks)
    ? container.planning.tasks
    : [];
  if (!sourceTasks.length || !contextAllowsWork(layer)) return container;

  const allowed = new Set(
    (layer?.requiredData?.tasks || [])
      .map((task) => String(task?.id || task?.taskId || '').trim())
      .filter(Boolean)
  );
  if (allowed.size === 0) return container;

  const filtered = sourceTasks.filter((task) =>
    allowed.has(String(task?.id || task?.taskId || ''))
  );
  if (!filtered.length) {
    console.warn(
      '[how-scope] allowed filter emptied tasks — keeping source WBS',
      `source=${sourceTasks.length}`,
      `allowed=${allowed.size}`
    );
    return container;
  }
  return {
    ...container,
    planning: {
      ...(container.planning || {}),
      tasks: filtered,
    },
  };
}

async function assembleHowToolContext(opts = {}) {
  const pack = opts.pack || {};
  const snapshot = opts.snapshot || null;
  const scope = runScope(pack, snapshot);
  const snapshotId = String(opts.snapshotId || snapshot?.id || 'run-current');
  const catalog = buildCatalog(opts, scope);
  const hits = citationHits(opts.contextPackage, scope);
  const pinned = await assembleContext({
    request: {
      purpose: opts.purpose,
      snapshotId,
      projectId: scope.projectId,
      organizationId: scope.organizationId,
      targetIds: opts.targetIds || [],
      tokenBudget: opts.tokenBudget,
      historicalEvidencePolicy: opts.historicalEvidencePolicy,
    },
    caller: {
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      actorId: 'how-phase',
      maxHistoricalEvidencePolicy: opts.maxHistoricalEvidencePolicy || 'SAME_ORGANIZATION',
    },
    ports: {
      loadSnapshot: async () => ({
        id: snapshotId,
        organizationId: scope.organizationId,
        projectId: scope.projectId,
        pinnedVersions: snapshot?.pinnedVersions || {},
      }),
      walkRequired: async ({ request }) => {
        const sections = {};
        for (const name of request.profile.required.sections) {
          let rows = catalog[name] || [];
          // DEPENDENCY endpoints are leaf tasks only — do not admit Epic/Story as "tasks".
          if (request.purpose === 'DEPENDENCY' && name === 'tasks') {
            rows = rows.filter((row) => {
              const level = String(row?.level || 'task').toLowerCase();
              return level === 'task' || level === 'subtask' || !row?.level;
            });
          }
          sections[name] = rows;
        }
        const expectedIds = [];
        for (const items of Object.values(sections)) {
          for (const item of items) expectedIds.push(item.id);
        }
        const requireAny = request.profile.requireAny || [];
        if (requireAny.length && !requireAny.some((name) => (sections[name] || []).length)) {
          expectedIds.push(`__missing_${opts.purpose}`);
        }
        if (request.purpose === 'WBS_GENERATION') {
          const present = new Set((sections.functionalRequirements || []).map((row) => row.id));
          for (const story of sections.story || []) {
            for (const frId of story.sourceFrIds || []) {
              if (!present.has(frId)) expectedIds.push(frId);
            }
          }
        }
        return { sections, expectedIds };
      },
      search: async () => hits,
    },
  });
  if (pinned && typeof pinned === 'object') {
    pinned.annotations = catalog.annotations || [];
  }
  return pinned;
}

function layerAllows(layer) {
  return contextAllowsWork(layer);
}

function missingSlotsFor(purpose, layer) {
  const ids = layer?.coverage?.missingIds || [];
  const slots = [];
  if (ids.some((id) => String(id).startsWith('__missing_'))) {
    const named = SLOT_BY_PURPOSE[purpose];
    if (named) slots.push(named);
  }
  for (const id of ids) {
    if (!String(id).startsWith('__missing_')) slots.push(id);
  }
  return slots;
}

module.exports = {
  assembleHowToolContext,
  slimLayer,
  contextAllowsWork,
  scopeContainerTasksByContext,
  layerAllows,
  missingSlotsFor,
  buildCatalog,
};
