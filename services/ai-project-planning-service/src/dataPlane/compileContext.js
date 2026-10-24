/**
 * One context compiler for WHAT and HOW.
 * Required records are selected by id and relation before any optional fill.
 * A required record is kept whole or the package is needs_split / insufficient_context.
 */

const { sha256 } = require('../semanticLayer/hash');
const { buildCanonicalStore } = require('./canonicalStore');
const { resolveProfile } = require('./profiles');

const EMPTY_ENTITIES = Object.freeze({
  stories: [],
  functionalRequirements: [],
  useCases: [],
  businessRules: [],
  constraints: [],
  tasks: [],
  nonFunctionalRequirements: [],
});

const TYPE_BUCKET = Object.freeze({
  story: 'stories',
  functional_requirement: 'functionalRequirements',
  use_case: 'useCases',
  business_rule: 'businessRules',
  constraint: 'constraints',
  task: 'tasks',
  non_functional_requirement: 'nonFunctionalRequirements',
});

function estimateTokens(value) {
  if (value == null) return 0;
  return Math.max(1, Math.ceil(JSON.stringify(value).length / 4));
}

function byType(store, type) {
  return (store.entities || []).filter((row) => row.entityType === type);
}

function indexById(store) {
  return new Map((store.entities || []).map((row) => [row.entityId, row]));
}

function bucketEntities(rows) {
  const entities = {
    stories: [],
    functionalRequirements: [],
    useCases: [],
    businessRules: [],
    constraints: [],
    tasks: [],
    nonFunctionalRequirements: [],
  };
  for (const row of rows) {
    const bucket = TYPE_BUCKET[row.entityType];
    if (bucket) entities[bucket].push(row);
  }
  return entities;
}

function refsOf(rows) {
  const refs = [];
  for (const row of rows) {
    refs.push(row.entityId);
    for (const ac of row.content?.acceptanceCriteria || []) {
      refs.push(`${row.entityId}:${ac.id}`);
    }
  }
  return refs;
}

function cloneFrWithAc(fr, acceptanceCriteria) {
  return {
    ...fr,
    content: {
      ...fr.content,
      acceptanceCriteria,
    },
  };
}

function splitOversizedFr(fr, budget) {
  const criteria = fr.content?.acceptanceCriteria || [];
  const bare = cloneFrWithAc(fr, []);
  if (estimateTokens(bare) > budget) return { ok: false, parts: [] };
  if (!criteria.length) return { ok: false, parts: [] };
  const parts = [];
  let current = [];
  for (const item of criteria) {
    const trial = cloneFrWithAc(fr, current.concat(item));
    if (current.length && estimateTokens(trial) > budget) {
      parts.push(cloneFrWithAc(fr, current));
      current = [item];
      if (estimateTokens(cloneFrWithAc(fr, current)) > budget) return { ok: false, parts: [] };
      continue;
    }
    if (!current.length && estimateTokens(trial) > budget) return { ok: false, parts: [] };
    current.push(item);
  }
  if (current.length) parts.push(cloneFrWithAc(fr, current));
  return { ok: parts.length > 0, parts };
}

function selectRequired(store, profile, focusRefs) {
  const focus = new Set((focusRefs || []).map((id) => String(id || '').trim()).filter(Boolean));
  const lookup = indexById(store);
  const required = [];
  const seen = new Set();
  const missing = [];

  const add = (row) => {
    if (!row || seen.has(row.entityId)) return;
    seen.add(row.entityId);
    required.push(row);
  };

  const addMissing = (id) => {
    if (id && !lookup.has(id) && !missing.includes(id)) missing.push(id);
  };

  if (profile.focusTypes?.includes('story')) {
    const stories = byType(store, 'story').filter((row) => !focus.size || focus.has(row.entityId));
    if (stories.length) {
      for (const story of stories) {
        add(story);
        for (const frId of story.content?.sourceFrIds || []) {
          const fr = lookup.get(frId);
          if (fr) add(fr);
          else addMissing(frId);
        }
      }
      return { required, missing };
    }
  }

  if (profile.focusTypes?.includes('task')) {
    const tasks = byType(store, 'task').filter((row) => !focus.size || focus.has(row.entityId));
    for (const task of tasks) {
      add(task);
      for (const frId of task.content?.sourceFrIds || []) {
        const fr = lookup.get(frId);
        if (fr) add(fr);
        else addMissing(frId);
      }
    }
    if (required.length) return { required, missing };
  }

  if (profile.focusTypes?.includes('functional_requirement')) {
    const cited = new Set(focus);
    if (!cited.size) {
      for (const task of byType(store, 'task')) {
        for (const frId of task.content?.sourceFrIds || []) cited.add(frId);
      }
    }
    if (cited.size) {
      for (const id of cited) {
        const fr = lookup.get(id);
        if (fr) add(fr);
        else addMissing(id);
      }
      for (const task of byType(store, 'task')) {
        const taskFr = task.content?.sourceFrIds || [];
        if (taskFr.some((id) => cited.has(id))) add(task);
      }
      return { required, missing };
    }
  }

  const types = profile.requiredTypes || profile.fallbackRequiredTypes || [];
  for (const type of types) {
    for (const row of byType(store, type)) add(row);
  }
  if (!required.length && profile.fallbackRequiredTypes) {
    for (const type of profile.fallbackRequiredTypes) {
      for (const row of byType(store, type)) add(row);
    }
  }
  return { required, missing };
}

function optionalRows(store, profile, requiredIds) {
  const rows = [];
  for (const type of profile.optionalTypes || []) {
    for (const row of byType(store, type)) {
      if (!requiredIds.has(row.entityId)) rows.push(row);
    }
  }
  return rows;
}

function partsForRequired(required, budget) {
  const stories = required.filter((row) => row.entityType === 'story');
  const consumed = new Set();
  const parts = [];
  const unsplittable = [];

  const pushFr = (fr, companions) => {
    const group = companions.concat(fr);
    if (estimateTokens(group) <= budget) {
      parts.push(group);
      return;
    }
    const split = splitOversizedFr(fr, budget);
    if (!split.ok) {
      unsplittable.push(fr.entityId);
      return;
    }
    for (const piece of split.parts) parts.push(companions.concat(piece));
  };

  if (stories.length) {
    for (const story of stories) {
      consumed.add(story.entityId);
      const frs = required.filter(
        (row) =>
          row.entityType === 'functional_requirement' &&
          (story.content?.sourceFrIds || []).includes(row.entityId)
      );
      frs.forEach((fr) => consumed.add(fr.entityId));
      if (!frs.length) {
        if (estimateTokens([story]) > budget) unsplittable.push(story.entityId);
        else parts.push([story]);
        continue;
      }
      const whole = [story, ...frs];
      if (estimateTokens(whole) <= budget) {
        parts.push(whole);
        continue;
      }
      for (const fr of frs) pushFr(fr, [story]);
    }
  }

  for (const row of required) {
    if (consumed.has(row.entityId)) continue;
    if (row.entityType === 'functional_requirement') {
      pushFr(row, []);
      continue;
    }
    if (estimateTokens([row]) > budget) unsplittable.push(row.entityId);
    else parts.push([row]);
  }

  return { parts, unsplittable };
}

function packParts(parts, budget) {
  const units = [];
  let current = [];
  let used = 0;
  for (const part of parts) {
    const cost = estimateTokens(part);
    const overlap = part.some((row) => current.some((have) => have.entityId === row.entityId));
    if (current.length && (used + cost > budget || overlap)) {
      units.push(current);
      current = [];
      used = 0;
    }
    current.push(...part);
    used += cost;
  }
  if (current.length) units.push(current);
  return units;
}

function fillOptional(units, optional, budget) {
  const included = [];
  const omitted = [];
  for (const row of optional) {
    const cost = estimateTokens([row]);
    const unit = units[units.length - 1];
    if (!unit) {
      omitted.push(row.entityId);
      continue;
    }
    if (estimateTokens(unit) + cost > budget) {
      omitted.push(row.entityId);
      continue;
    }
    unit.push(row);
    included.push(row.entityId);
  }
  return { included, omitted };
}

function annotationsFor(store, includedIds) {
  return (store.annotations || []).filter((row) => includedIds.has(row.subjectRef?.entityId));
}

function compileContext(request = {}) {
  const profile = resolveProfile(request.profile || request.taskType);
  if (!profile) {
    return {
      ok: false,
      status: 'insufficient_context',
      code: 'UNKNOWN_PROFILE',
      profile: request.profile || request.taskType || null,
    };
  }
  const store = request.store || buildCanonicalStore(request);
  const budgetMax = Number(request.budget?.maxInputTokens) > 0
    ? Number(request.budget.maxInputTokens)
    : profile.defaultBudget;
  const { required, missing } = selectRequired(store, profile, request.focusRefs);
  const requiredIds = new Set(required.map((row) => row.entityId));
  const { parts, unsplittable } = partsForRequired(required, budgetMax);
  const missingRefs = [...missing, ...unsplittable];
  let units = packParts(parts, budgetMax);
  if (!units.length) units = [[]];
  const optional = optionalRows(store, profile, requiredIds);
  const optionalFill = units[0] ? fillOptional(units, optional, budgetMax) : { included: [], omitted: [] };

  const workUnits = units.map((rows, index) => ({
    unitId: `wu_${index + 1}`,
    entities: bucketEntities(rows),
    refs: refsOf(rows),
  }));
  const includedRows = units.flat();
  const includedIds = new Set(includedRows.map((row) => row.entityId));
  const includedRefs = refsOf(includedRows);
  const requiredRefs = [...refsOf(required), ...missing];
  const deferredRefs = workUnits.slice(1).flatMap((unit) => unit.refs);
  let status = 'ready';
  if (missingRefs.length) status = 'insufficient_context';
  else if (workUnits.length > 1) status = 'needs_split';

  const focus = {
    storyIds: (request.focusRefs || []).filter((id) => byType(store, 'story').some((row) => row.entityId === id)),
    frIds: required.filter((row) => row.entityType === 'functional_requirement').map((row) => row.entityId),
    taskIds: required.filter((row) => row.entityType === 'task').map((row) => row.entityId),
  };
  const assembly = {
    snapshotId: store.snapshotId || request.snapshotId || null,
    profile: profile.name,
    revisionIds: includedRows.map((row) => `${row.entityId}@${row.revision}`).sort(),
  };
  const estimated = estimateTokens(bucketEntities(includedRows));

  return {
    ok: status !== 'insufficient_context',
    contextPackageId: `ctx_${sha256(assembly).slice(0, 12)}`,
    snapshotId: assembly.snapshotId,
    phase: request.phase || profile.phase,
    profile: profile.name,
    status,
    focus,
    entities: workUnits[0]?.entities || { ...EMPTY_ENTITIES },
    workUnits,
    annotations: annotationsFor(store, includedIds),
    coverage: {
      requiredRefs,
      includedRefs,
      missingRefs,
      omittedOptionalRefs: optionalFill.omitted,
      deferredRefs,
    },
    budget: {
      maxInputTokens: budgetMax,
      estimatedInputTokens: estimated,
    },
  };
}

module.exports = {
  compileContext,
  estimateTokens,
};
