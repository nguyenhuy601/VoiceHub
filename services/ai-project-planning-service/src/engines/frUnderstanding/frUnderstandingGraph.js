/**
 * FR Understanding StateGraph — prefix → semantic → conflict → evidence → synthesis.
 * SoT: compiled as node `runFrUnderstanding` on whatPhaseGraph (Pattern B). No checkpointer (parent owns).
 * Wire/checkpoint field: `frUnderstanding` (legacy pack reads may still see `g4Understanding`).
 * Stage timing keys `g4_semantic` / `g4_conflict` / `g4_synthesis` kept for progress mappers.
 */

const { Annotation, StateGraph, START, END } = require('@langchain/langgraph');
const { resolveFrPolicy } = require('../../config/frPolicy');
const { generateJson } = require('../../runtime/ollamaGenerate');
const { invokeTool } = require('../../registry/toolRegistry');
const { validateRelationships } = require('../../validation/relationshipValidator');
const { selectModel, loadSkillStub } = require('../../runtime/intelligenceRuntime');
const { requirementUnderstandingSkill } = require('../../skills/requirementUnderstanding.skill');
const { projectWhatSnapshot } = require('../g4UnderstandingLegacyProjection');

const { normalizeSnapshotFrs } = require('./normalize');
const { extractAllSignals } = require('./extractSignals');
const {
  selectCandidates,
  needsSemanticLlm,
  needsConflictLlm,
} = require('./candidateSelector');
const { emitConstraintFactsFromSignals } = require('./normalizedConstraintFact');
const { buildPotentialConflictRelations } = require('./conflictRelations');
const {
  runSemanticProjection,
  runConflictProjection,
} = require('./semanticProjection');
const { buildEvidenceBundle } = require('./evidenceBuilder');
const { runSynthesis } = require('./synthesis');
const { substepMeta } = require('./pipelineProgress');

const PROMPT_VERSION = 'g4-semantic-pipeline-v1';

function field() {
  return Annotation();
}

const FrUnderstandingState = Annotation.Root({
  snapshot: field(),
  pack: field(),
  env: field(),
  generateJsonFn: field(),
  forceHeuristic: field(),
  skipLlm: field(),
  priorPartial: field(),
  reuseContextPackage: field(),
  priorCorpusHash: field(),
  loop1Reenter: field(),
  skipIngest: field(),
  snapshotId: field(),
  embedFn: field(),
  qdrant: field(),
  constraintFactsIn: field(),

  startedAt: field(),
  policy: field(),
  skillLoad: field(),
  modelInfo: field(),
  blocked: field(),
  errorCode: field(),

  /** Prefix node output (channel ≠ node name `prefix`). */
  prefixBundle: field(),
  functionalRequirements: field(),
  selection: field(),
  projected: field(),
  toolResult: field(),
  toolEvidence: field(),
  constraintFacts: field(),

  contextPackage: field(),
  corpusContentHash: field(),
  contextText: field(),

  llmCalls: field(),
  llmFailed: field(),
  partial: field(),
  lastError: field(),
  semanticItems: field(),
  conflicts: field(),
  stageTimings: field(),

  requirements: field(),
  validation: field(),
  ambiguities: field(),
  assumptions: field(),
  /** Evidence node output (channel ≠ node name `evidence`). */
  evidenceBundle: field(),
  /** Synthesis summary text (channel ≠ node name `synthesis`). */
  synthesisSummary: field(),

  frUnderstanding: field(),
  skill: field(),
  model: field(),
});

async function emitProgress(onProgress, substep) {
  if (typeof onProgress !== 'function') return;
  const meta = substepMeta(substep);
  if (!meta) return;
  await onProgress({ step: meta.step, substep: meta.substep });
}

async function runUnderstandPrefix(opts, policy, snapshot) {
  await emitProgress(opts.onProgress, 'parse');
  const { functionalRequirements, duplicates } = normalizeSnapshotFrs(snapshot, {
    maxFr: policy.input.maxFr,
  });
  await emitProgress(opts.onProgress, 'normalize');
  const projected = {
    ...projectWhatSnapshot({ ...snapshot, functionalRequirements }),
    functionalRequirements,
  };

  await emitProgress(opts.onProgress, 'extract');
  const signals = policy.preAnalysis.enabled
    ? extractAllSignals(functionalRequirements)
    : functionalRequirements.map((fr) => ({
        frId: fr.id,
        text: [fr.title, fr.description].filter(Boolean).join(' '),
        flags: [],
        actors: [],
        actions: [],
        objects: [],
        fields: [],
      }));

  for (const id of duplicates) {
    const s = signals.find((x) => x.frId === id);
    if (s) s.flags = [...(s.flags || []), 'duplicate'];
  }

  await emitProgress(opts.onProgress, 'filter');
  const constraintFacts = [
    ...emitConstraintFactsFromSignals(signals),
    ...(Array.isArray(opts.constraintFacts) ? opts.constraintFacts : []),
  ];
  const conflictBuilt = buildPotentialConflictRelations(constraintFacts);
  const selection = selectCandidates(signals, {
    enabled: policy.candidateSelection.enabled,
    conflictRelations: conflictBuilt.relations,
  });

  await emitProgress(opts.onProgress, 'quality');
  const toolOut = await invokeTool(
    'RequirementAnalysisTool',
    { ...projected, snapshotId: projected.snapshotId, packId: projected.packId },
    { contextName: 'understanding', requiresSatisfied: { snapshot: true } }
  );
  const toolResult = toolOut?.result || {};
  const toolEvidence = Array.isArray(toolOut?.evidence) ? toolOut.evidence : [];

  return {
    functionalRequirements,
    duplicates,
    signals,
    selection,
    constraintFacts,
    conflictRelations: conflictBuilt.relations,
    projected,
    toolResult,
    toolEvidence,
  };
}

function hasResumePartial(priorPartial) {
  return Boolean(
    priorPartial &&
      typeof priorPartial === 'object' &&
      priorPartial.selection &&
      priorPartial.projected
  );
}

function emptyStageTimings() {
  return {
    g4_semantic: { ms: 0, calls: 0, evalCount: 0, promptChars: 0 },
    g4_conflict: { ms: 0, calls: 0, evalCount: 0, promptChars: 0, skipReason: null },
    g4_synthesis: { ms: 0, calls: 0, evalCount: 0, promptChars: 0, skipReason: null },
  };
}

function mapOptsToFrState(opts = {}) {
  return {
    snapshot: opts.snapshot || opts.pack || {},
    pack: opts.pack || {},
    env: opts.env || process.env,
    generateJsonFn: opts.generateJsonFn || null,
    forceHeuristic: Boolean(opts.forceHeuristic),
    skipLlm: Boolean(opts.skipLlm),
    priorPartial: opts.priorPartial || null,
    reuseContextPackage: opts.reuseContextPackage || null,
    priorCorpusHash: opts.priorCorpusHash || null,
    loop1Reenter: Boolean(opts.loop1Reenter),
    skipIngest: opts.skipIngest === true,
    snapshotId: opts.snapshotId || null,
    embedFn: opts.embedFn || null,
    qdrant: opts.qdrant || null,
    constraintFactsIn: Array.isArray(opts.constraintFacts) ? opts.constraintFacts : [],
  };
}

function mapFrStateToPipelineResult(state) {
  if (state.blocked) {
    return {
      blocked: true,
      errorCode: state.errorCode || 'REQUIREMENT_NOT_READY',
      functionalRequirements: Array.isArray(state.functionalRequirements)
        ? state.functionalRequirements
        : [],
    };
  }
  return {
    frUnderstanding: state.frUnderstanding,
    projected: state.projected,
    validation: state.validation,
    skill: state.skill || state.skillLoad?.skill,
    model: state.model || state.modelInfo,
    selection: state.selection,
    contextPackage: state.contextPackage,
    corpusContentHash: state.corpusContentHash,
  };
}

/**
 * @param {{ onProgress?: Function }} [hooks]
 * @returns {import('@langchain/langgraph').CompiledStateGraph}
 */
function buildFrUnderstandingGraph(hooks = {}) {
  const onProgress = hooks.onProgress || null;
  const graph = new StateGraph(FrUnderstandingState);

  graph.addNode('prefix', async (state) => {
    const startedAt = Date.now();
    const env = state.env || process.env;
    const policy = resolveFrPolicy(env);
    const snapshot = state.snapshot || state.pack || {};
    const progressOpts = { onProgress };

    if (!hasResumePartial(state.priorPartial)) {
      const { listFrs } = require('../../tools/requirementAnalysis');
      let listedFrs;
      try {
        listedFrs = listFrs(snapshot);
      } catch (err) {
        if (err.code === 'SNAPSHOT_FR_MISMATCH') {
          return {
            startedAt,
            policy,
            blocked: true,
            errorCode: 'SNAPSHOT_FR_MISMATCH',
            functionalRequirements: [],
          };
        }
        throw err;
      }
      if (!Array.isArray(listedFrs) || listedFrs.length === 0) {
        return {
          startedAt,
          policy,
          blocked: true,
          errorCode: 'REQUIREMENT_NOT_READY',
          functionalRequirements: [],
        };
      }
    }

    const skillLoad = loadSkillStub(requirementUnderstandingSkill);
    const modelInfo = selectModel(env);

    const prefix = hasResumePartial(state.priorPartial)
      ? state.priorPartial
      : await runUnderstandPrefix(
          {
            ...progressOpts,
            constraintFacts: state.constraintFactsIn || [],
          },
          policy,
          snapshot
        );

    const {
      functionalRequirements,
      selection,
      projected,
      toolResult,
      toolEvidence,
      constraintFacts = [],
    } = prefix;

    let contextPackage = state.reuseContextPackage || null;
    let corpusContentHash =
      state.priorCorpusHash || prefix.corpusContentHash || null;
    const snapshotId = String(
      state.snapshotId ||
        projected?.snapshotId ||
        snapshot?.snapshotId ||
        snapshot?.id ||
        ''
    ).trim();

    try {
      const {
        ingestSnapshotToQdrant,
        isIngestAfterQualityEnabled,
      } = require('../../retrieval/ingestSnapshotToQdrant');
      const { buildCorpusFromSnapshot } = require('../../retrieval/buildCorpusFromSnapshot');
      const { assembleContextPackageAsync } = require('../../retrieval/contextAssembly');
      const { getG7RagMode } = require('../../retrieval/g7PipelineSchemas');

      const validFrs = Array.isArray(functionalRequirements)
        ? functionalRequirements
        : [];
      const corpus = buildCorpusFromSnapshot(
        { ...(snapshot && typeof snapshot === 'object' ? snapshot : {}), snapshotId },
        { frOverride: validFrs }
      );

      const loop1SkipIngest = Boolean(
        state.reuseContextPackage &&
          state.priorCorpusHash &&
          (state.loop1Reenter || state.skipIngest === true)
      );
      const mode = getG7RagMode(env);
      if (isIngestAfterQualityEnabled(env) && snapshotId && !loop1SkipIngest) {
        if (mode === 'qdrant' || mode === 'hybrid') {
          const ingestOut = await ingestSnapshotToQdrant({
            snapshot,
            snapshotId,
            frOverride: validFrs,
            corpus,
            priorCorpusHash: corpusContentHash,
            afterQuality: true,
            env,
            embedFn: state.embedFn,
            qdrant: state.qdrant,
          });
          corpusContentHash = ingestOut.corpusContentHash || corpusContentHash;
        }
      } else if (loop1SkipIngest && state.priorCorpusHash) {
        corpusContentHash = String(state.priorCorpusHash);
      }

      if (!contextPackage) {
        const { buildWhatRetrieveQuery } = require('../../retrieval/formatRetrievedContext');
        const fallbackText = String(
          projected?.overview?.requirementName ||
            snapshot?.overview?.requirementName ||
            ''
        );
        contextPackage = await assembleContextPackageAsync({
          query: buildWhatRetrieveQuery({
            snapshot,
            functionalRequirements: validFrs,
          }),
          corpus: corpus.length
            ? corpus
            : fallbackText
              ? [{ id: 'snap_overview', text: fallbackText }]
              : [],
          snapshotId,
          env,
          mode,
        });
      }
    } catch (ingestErr) {
      const { getG7RagMode, requiresQdrant } = require('../../retrieval/g7PipelineSchemas');
      if (requiresQdrant(getG7RagMode(env))) {
        console.error('[g7_ingest] g4 fail-closed', ingestErr?.message || ingestErr);
        throw ingestErr;
      }
      console.warn('[g7_ingest] g4 soft', ingestErr?.message || ingestErr);
    }

    const { formatRetrievedContext } = require('../../retrieval/formatRetrievedContext');
    const contextText = formatRetrievedContext(contextPackage).text;

    return {
      startedAt,
      policy,
      skillLoad,
      modelInfo,
      blocked: false,
      errorCode: null,
      prefixBundle: prefix,
      functionalRequirements,
      selection,
      projected,
      toolResult,
      toolEvidence,
      constraintFacts,
      contextPackage,
      corpusContentHash,
      contextText,
      llmCalls: 0,
      llmFailed: 0,
      partial: false,
      lastError: null,
      semanticItems: [],
      conflicts: [],
      stageTimings: emptyStageTimings(),
    };
  });

  graph.addNode('semantic', async (state) => {
    if (state.blocked) return {};
    const policy = state.policy || resolveFrPolicy(state.env || process.env);
    const generate = state.generateJsonFn || generateJson;
    const selection = state.selection || { candidates: [], counts: {} };
    const skipLlm = Boolean(state.forceHeuristic || state.skipLlm);
    const stageTimings = { ...(state.stageTimings || emptyStageTimings()) };
    stageTimings.g4_semantic = {
      ...(stageTimings.g4_semantic || {}),
      ms: 0,
      calls: 0,
      evalCount: 0,
      promptChars: 0,
    };

    let llmCalls = Number(state.llmCalls) || 0;
    let llmFailed = Number(state.llmFailed) || 0;
    let partial = Boolean(state.partial);
    let lastError = state.lastError || null;
    const semanticItems = [];

    await emitProgress(onProgress, 'semantic');
    if (!skipLlm && needsSemanticLlm(selection) && policy.llm.semanticProjection.enabled) {
      const { compileContext } = require('../../dataPlane/compileContext');
      const snapshot = state.snapshot || {};
      const candidateIds = new Set(selection.candidates.map((row) => String(row.frId)));
      const compiled = compileContext({
        phase: 'WHAT',
        profile: 'WHAT_REQUIREMENT_UNDERSTANDING',
        pack: {
          functionalRequirements: (state.prefixBundle?.functionalRequirements || []).filter((row) =>
            candidateIds.has(String(row.id))
          ),
          organizationId: snapshot.organizationId,
          projectId: snapshot.projectId || snapshot.packId,
        },
        snapshot,
        snapshotId: state.snapshotId || state.projected?.snapshotId,
        budget: { maxInputTokens: policy.llm.semanticProjection.maxInputTokens },
      });
      const batches = [];
      const candidateById = new Map(selection.candidates.map((row) => [String(row.frId), row]));
      for (const unit of compiled.workUnits || []) {
        const batch = [];
        for (const row of unit.entities?.functionalRequirements || []) {
          const candidate = candidateById.get(String(row.entityId));
          if (candidate) batch.push(candidate);
        }
        if (batch.length) batches.push(batch);
      }
      if (compiled.status === 'insufficient_context') {
        partial = true;
        lastError = lastError || 'insufficient_context';
      }
      stageTimings.g4_semantic.contextStatus = compiled.status;
      stageTimings.g4_semantic.missingRefs = compiled.coverage?.missingRefs || [];
      for (const batch of batches) {
        const sem = await runSemanticProjection({
          generateJson: generate,
          batch,
          contextText: state.contextText || '',
          policy: policy.llm.semanticProjection,
          requireEvidence: policy.evidence.required,
          env: state.env || process.env,
        });
        llmCalls += sem.llmCalls || 0;
        stageTimings.g4_semantic.ms += Number(sem.durationMs) || 0;
        stageTimings.g4_semantic.calls += Number(sem.llmCalls) || 0;
        stageTimings.g4_semantic.evalCount += Number(sem.evalCount) || 0;
        stageTimings.g4_semantic.promptChars += Number(sem.promptChars) || 0;
        if (!sem.ok) {
          llmFailed += 1;
          partial = true;
          lastError = sem.error || 'semantic_failed';
          if (!policy.failure.continueOnTimeout && sem.error === 'ollama_timeout') break;
          if (!policy.failure.continueOnParseError && sem.error === 'ollama_json_parse') break;
          continue;
        }
        semanticItems.push(...(sem.items || []));
      }
    } else {
      stageTimings.g4_semantic.skipReason = skipLlm
        ? 'skip_llm'
        : !needsSemanticLlm(selection)
          ? 'no_candidates'
          : 'disabled';
    }

    return {
      semanticItems,
      llmCalls,
      llmFailed,
      partial,
      lastError,
      stageTimings,
    };
  });

  graph.addNode('conflict', async (state) => {
    if (state.blocked) return {};
    const policy = state.policy || resolveFrPolicy(state.env || process.env);
    const generate = state.generateJsonFn || generateJson;
    const selection = state.selection || { candidates: [], conflicts: {} };
    const skipLlm = Boolean(state.forceHeuristic || state.skipLlm);
    const stageTimings = { ...(state.stageTimings || emptyStageTimings()) };
    stageTimings.g4_conflict = {
      ...(stageTimings.g4_conflict || {}),
      ms: 0,
      calls: 0,
      evalCount: 0,
      promptChars: 0,
    };

    let llmCalls = Number(state.llmCalls) || 0;
    let llmFailed = Number(state.llmFailed) || 0;
    let partial = Boolean(state.partial);
    let lastError = state.lastError || null;
    let conflicts = [];
    const constraintFacts = state.constraintFacts || [];
    const semanticItems = Array.isArray(state.semanticItems) ? state.semanticItems : [];
    const toolResult = state.toolResult || {};
    const functionalRequirements = state.functionalRequirements || [];

    await emitProgress(onProgress, 'conflict');
    if (!skipLlm && needsConflictLlm(selection) && policy.llm.conflictAnalysis.enabled) {
      const relationBatch = Array.isArray(selection.conflicts?.relations)
        ? selection.conflicts.relations.slice(0, 20)
        : [];
      const conf = await runConflictProjection({
        generateJson: generate,
        contextText: state.contextText || '',
        batch: relationBatch.length
          ? relationBatch.map((rel) => ({
              pairKey: rel.pairKey,
              frIds: rel.frIds,
              targetKey: rel.targetKey,
              constraintType: rel.constraintType,
              relation: rel.relation,
              evidence: rel.evidence,
              facts: constraintFacts.filter((f) =>
                (rel.frIds || []).includes(String(f.frId))
              ),
            }))
          : selection.candidates
              .filter(
                (c) =>
                  c.reasons?.includes('potential_conflict') ||
                  c.reasons?.includes('conflict')
              )
              .slice(0, 20),
        policy: policy.llm.conflictAnalysis,
        env: state.env || process.env,
      });
      llmCalls += conf.llmCalls || 0;
      stageTimings.g4_conflict.ms += Number(conf.durationMs) || 0;
      stageTimings.g4_conflict.calls += Number(conf.llmCalls) || 0;
      stageTimings.g4_conflict.evalCount += Number(conf.evalCount) || 0;
      stageTimings.g4_conflict.promptChars += Number(conf.promptChars) || 0;
      if (!conf.ok) {
        llmFailed += 1;
        partial = true;
        lastError = conf.error || lastError;
      } else {
        conflicts = conf.conflicts || [];
      }
    } else {
      stageTimings.g4_conflict.skipReason = skipLlm
        ? 'skip_llm'
        : !needsConflictLlm(selection)
          ? 'no_relations'
          : 'disabled';
    }

    const requirements = Array.isArray(toolResult.requirements)
      ? toolResult.requirements
      : functionalRequirements;

    const llmRels = [];
    for (const item of semanticItems) {
      for (const rel of item.relationships || []) {
        llmRels.push({
          from: item.frId,
          to: rel.target,
          type: 'semantic_related',
          note: rel.reason,
          evidence: item.evidence,
          confidence: 0.6,
        });
      }
    }

    const combinedRels = [
      ...(Array.isArray(toolResult.relationships) ? toolResult.relationships : []),
      ...llmRels,
    ];
    await emitProgress(onProgress, 'validate');
    const validation = validateRelationships({
      requirements,
      relationships: combinedRels,
    });

    const ambiguities = [
      ...(Array.isArray(toolResult.ambiguities) ? toolResult.ambiguities : []),
      ...semanticItems.flatMap((i) =>
        (i.ambiguities || []).map((a) => ({
          requirementId: i.frId,
          kind: a.field || 'semantic',
          message: a.issue,
        }))
      ),
    ];
    const assumptions = Array.isArray(toolResult.assumptions) ? toolResult.assumptions : [];

    return {
      conflicts,
      llmCalls,
      llmFailed,
      partial,
      lastError,
      stageTimings,
      requirements,
      validation,
      ambiguities,
      assumptions,
    };
  });

  graph.addNode('evidence', async (state) => {
    if (state.blocked) return {};
    await emitProgress(onProgress, 'evidence');
    const evidenceBundle = buildEvidenceBundle({
      snapshotId: state.projected?.snapshotId,
      toolEvidence: state.toolEvidence,
      semanticItems: state.semanticItems || [],
      conflicts: state.conflicts || [],
      validation: state.validation,
    });
    return { evidenceBundle };
  });

  graph.addNode('synthesis', async (state) => {
    if (state.blocked) {
      return {
        frUnderstanding: null,
        skill: state.skillLoad?.skill || null,
        model: state.modelInfo || null,
      };
    }

    const policy = state.policy || resolveFrPolicy(state.env || process.env);
    const generate = state.generateJsonFn || generateJson;
    const skipLlm = Boolean(state.forceHeuristic || state.skipLlm);
    const stageTimings = { ...(state.stageTimings || emptyStageTimings()) };
    stageTimings.g4_synthesis = {
      ...(stageTimings.g4_synthesis || {}),
      ms: 0,
      calls: 0,
      evalCount: 0,
      promptChars: 0,
    };

    let llmCalls = Number(state.llmCalls) || 0;
    let llmFailed = Number(state.llmFailed) || 0;
    let partial = Boolean(state.partial);
    let lastError = state.lastError || null;
    let synthesisSummary = null;
    const semanticItems = state.semanticItems || [];
    const conflicts = state.conflicts || [];
    const selection = state.selection || { counts: {} };
    const toolResult = state.toolResult || {};
    const ambiguities = state.ambiguities || [];
    const validation = state.validation || { ok: true, accepted: [], rejected: [] };
    const skillLoad = state.skillLoad || {};
    const modelInfo = state.modelInfo || {};

    await emitProgress(onProgress, 'synthesis');
    if (
      !skipLlm &&
      policy.llm.synthesis.enabled &&
      (semanticItems.length > 0 || conflicts.length > 0)
    ) {
      const syn = await runSynthesis({
        generateJson: generate,
        policy: policy.llm.synthesis,
        counts: selection.counts,
        semanticItems,
        conflicts,
        toolFacts: toolResult.facts || {},
        ambiguities,
        contextText: state.contextText || '',
        env: state.env || process.env,
      });
      llmCalls += syn.llmCalls || 0;
      stageTimings.g4_synthesis.ms += Number(syn.durationMs) || 0;
      stageTimings.g4_synthesis.calls += Number(syn.llmCalls) || 0;
      stageTimings.g4_synthesis.evalCount += Number(syn.evalCount) || 0;
      stageTimings.g4_synthesis.promptChars += Number(syn.promptChars) || 0;
      if (syn.ok) synthesisSummary = syn.summary;
      else {
        llmFailed += 1;
        partial = true;
        lastError = syn.error || lastError;
      }
    } else {
      stageTimings.g4_synthesis.skipReason = skipLlm
        ? 'skip_llm'
        : !(semanticItems.length > 0 || conflicts.length > 0)
          ? 'no_semantic_or_conflict'
          : 'disabled';
    }

    const llmStatus =
      llmCalls === 0 ? 'skipped' : llmFailed > 0 || partial ? 'partial' : 'ok';

    const frUnderstanding = {
      requirements: state.requirements,
      relationships: validation.accepted,
      ambiguities,
      assumptions: state.assumptions || [],
      evidence: state.evidenceBundle,
      rejectedRelationships: validation.rejected,
      facts: toolResult.facts || {},
      semanticItems,
      conflicts,
      synthesis: synthesisSummary,
      signalsMeta: selection.counts,
      meta: {
        model: llmCalls > 0 ? modelInfo.model : null,
        skillId: skillLoad.skill?.skillId || requirementUnderstandingSkill.skillId,
        skillVersion: skillLoad.skill?.version || requirementUnderstandingSkill.version,
        promptVersion: PROMPT_VERSION,
        pipeline: 'semantic_v1',
        llmCalls,
        llmFailed,
        partial: Boolean(partial || !validation.ok),
        lastError,
        durationMs: Math.max(0, Date.now() - (state.startedAt || Date.now())),
        validationOk: validation.ok,
        candidateCount: selection.counts?.candidates,
        clearCount: selection.counts?.clear,
        stageTimings,
        llm: {
          status: llmStatus,
          calls: llmCalls,
          failed: llmFailed,
        },
      },
    };

    console.info(
      `[g4] stage=pipeline candidates=${selection.counts?.candidates} llmCalls=${llmCalls} partial=${frUnderstanding.meta.partial} stageTimings=%s`,
      JSON.stringify(stageTimings)
    );

    return {
      synthesisSummary,
      llmCalls,
      llmFailed,
      partial,
      lastError,
      stageTimings,
      frUnderstanding,
      skill: skillLoad.skill,
      model: modelInfo,
    };
  });

  graph.addEdge(START, 'prefix');
  graph.addConditionalEdges('prefix', (state) => (state.blocked ? 'synthesis' : 'semantic'), {
    synthesis: 'synthesis',
    semantic: 'semantic',
  });
  graph.addEdge('semantic', 'conflict');
  graph.addEdge('conflict', 'evidence');
  graph.addEdge('evidence', 'synthesis');
  graph.addEdge('synthesis', END);

  return graph.compile();
}

/**
 * Test-only / allowStandaloneFrGraph entry — NOT production SoT (RULE-LG-FR).
 * @param {object} [opts]
 */
async function invokeFrUnderstandingStandalone(opts = {}) {
  if (opts.allowStandaloneFrGraph !== true) {
    const err = new Error(
      'FR understanding graph.invoke is test/standalone-only. Production SoT is whatPhaseGraph node runFrUnderstanding.'
    );
    err.code = 'PHASE_GRAPH_ONLY';
    throw err;
  }
  const graph = buildFrUnderstandingGraph({ onProgress: opts.onProgress || null });
  const state = await graph.invoke(mapOptsToFrState(opts));
  return mapFrStateToPipelineResult(state);
}

module.exports = {
  PROMPT_VERSION,
  FrUnderstandingState,
  buildFrUnderstandingGraph,
  runUnderstandPrefix,
  hasResumePartial,
  invokeFrUnderstandingStandalone,
  mapOptsToFrState,
  mapFrStateToPipelineResult,
};
