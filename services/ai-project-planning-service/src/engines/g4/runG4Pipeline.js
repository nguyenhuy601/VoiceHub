/**
 * G4 Semantic Engine (FR path capability).
 * Normalize → Signals → Candidates → [data gate] → Semantic LLM → Validate → Conflict → Evidence → Synthesis
 *
 * Persistence: NONE — callers must reduce into analyses.srsProposal (never write g4Understanding).
 * Preferred entry for FR analysis: requirementAnalysis/functionalRequirements/analyzeFunctionalRequirements.
 */

const { resolveAiG4Policy } = require('../../config/aiG4Policy');
const { generateJson } = require('../../runtime/ollamaGenerate');
const { invokeTool } = require('../../registry/toolRegistry');
const { registerDefaultTools } = require('../../tools/registerDefaultTools');
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
const { packByTokenBudget } = require('./tokenPack');
const {
  runSemanticProjection,
  runConflictProjection,
} = require('./semanticProjection');
const { buildEvidenceBundle } = require('./evidenceBuilder');
const { runSynthesis } = require('./synthesis');
const { substepMeta } = require('./pipelineProgress');

const PROMPT_VERSION = 'g4-semantic-pipeline-v1';

async function emitProgress(onProgress, substep) {
  if (typeof onProgress !== 'function') return;
  const meta = substepMeta(substep);
  if (!meta) return;
  await onProgress({ step: meta.step, substep: meta.substep });
}

async function runUnderstandPrefix(opts, policy, snapshot) {
  registerDefaultTools();
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
  // Structured facts only — emitter returns [] when no actor_policy SoT (W1 inventory)
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

/**
 * @param {{ snapshot?: object, pack?: object, env?: object, generateJsonFn?: Function, forceHeuristic?: boolean, skipLlm?: boolean, onProgress?: Function, pauseAtDataGate?: boolean, priorPartial?: object }} opts
 * RULE-R01/R07: Data Gate HITL removed — `pauseAtDataGate` is ignored; quality → semantic straight.
 */
async function runG4Pipeline(opts = {}) {
  registerDefaultTools();
  const startedAt = Date.now();
  const env = opts.env || process.env;
  const policy = resolveAiG4Policy(env);
  const generate = opts.generateJsonFn || generateJson;
  const snapshot = opts.snapshot || opts.pack || {};
  if (!hasResumePartial(opts.priorPartial)) {
    const { listFrs } = require('../../tools/requirementAnalysis');
    let listedFrs;
    try {
      listedFrs = listFrs(snapshot);
    } catch (err) {
      if (err.code === 'SNAPSHOT_FR_MISMATCH') {
        return {
          blocked: true,
          errorCode: 'SNAPSHOT_FR_MISMATCH',
          functionalRequirements: [],
        };
      }
      throw err;
    }
    if (!Array.isArray(listedFrs) || listedFrs.length === 0) {
      return {
        blocked: true,
        errorCode: 'REQUIREMENT_NOT_READY',
        functionalRequirements: [],
      };
    }
  }
  const skillLoad = loadSkillStub(requirementUnderstandingSkill);
  const modelInfo = selectModel(env);

  const prefix = hasResumePartial(opts.priorPartial)
    ? opts.priorPartial
    : await runUnderstandPrefix(opts, policy, snapshot);

  const {
    functionalRequirements,
    selection,
    projected,
    toolResult,
    toolEvidence,
    constraintFacts = [],
  } = prefix;

  // RULE-DL-06/09: G4 owns Qdrant ingest after quality — corpus = quality-valid set (not candidates)
  let contextPackage = opts.reuseContextPackage || null;
  let corpusContentHash =
    opts.priorCorpusHash || prefix.corpusContentHash || null;
  const snapshotId = String(
    opts.snapshotId ||
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

    // PLAN B / C6: Loop1 with reuseContextPackage + priorCorpusHash → no re-ingest
    const loop1SkipIngest = Boolean(
      opts.reuseContextPackage &&
        opts.priorCorpusHash &&
        (opts.loop1Reenter || opts.skipIngest === true)
    );
    // PERF: PHASE1_RAG=stub|off wins over G7_RAG_MODE=hybrid (avoid DNS/embed ~10s+ soft-fail).
    const phase1Rag = String(env.PHASE1_RAG || 'stub').trim().toLowerCase();
    const forceStubRag = phase1Rag === 'stub' || phase1Rag === 'off' || phase1Rag === '0';
    const mode = forceStubRag ? 'stub' : getG7RagMode(env);
    if (
      !forceStubRag &&
      isIngestAfterQualityEnabled(env) &&
      snapshotId &&
      !loop1SkipIngest
    ) {
      if (mode === 'qdrant' || mode === 'hybrid') {
        const ingestOut = await ingestSnapshotToQdrant({
          snapshot,
          snapshotId,
          frOverride: validFrs,
          corpus,
          priorCorpusHash: corpusContentHash,
          afterQuality: true,
          env,
          embedFn: opts.embedFn,
          qdrant: opts.qdrant,
        });
        corpusContentHash = ingestOut.corpusContentHash || corpusContentHash;
      }
    } else if (loop1SkipIngest && opts.priorCorpusHash) {
      corpusContentHash = String(opts.priorCorpusHash);
    }

    if (!contextPackage) {
      const fallbackText = String(
        projected?.overview?.requirementName ||
          snapshot?.overview?.requirementName ||
          ''
      );
      const assembleInput = {
        query: 'what_requirements',
        corpus: corpus.length
          ? corpus
          : fallbackText
            ? [{ id: 'snap_overview', text: fallbackText }]
            : [],
        snapshotId,
        env,
        mode: forceStubRag ? 'stub' : mode,
      };
      contextPackage = forceStubRag
        ? require('../../retrieval/contextAssembly').assembleContextPackage(assembleInput)
        : await assembleContextPackageAsync(assembleInput);
    }
  } catch (ingestErr) {
    const { getG7RagMode } = require('../../retrieval/g7PipelineSchemas');
    if (getG7RagMode(env) === 'qdrant') throw ingestErr;
    console.warn('[g7_ingest] g4 soft', ingestErr?.message || ingestErr);
  }

  let llmCalls = 0;
  let llmFailed = 0;
  let partial = false;
  let lastError = null;
  const semanticItems = [];
  let conflicts = [];
  const stageTimings = {
    g4_semantic: { ms: 0, calls: 0, evalCount: 0, promptChars: 0 },
    g4_conflict: { ms: 0, calls: 0, evalCount: 0, promptChars: 0, skipReason: null },
    g4_synthesis: { ms: 0, calls: 0, evalCount: 0, promptChars: 0, skipReason: null },
  };

  const skipLlm = Boolean(opts.forceHeuristic || opts.skipLlm || !policy.pipelineEnabled);

  await emitProgress(opts.onProgress, 'semantic');
  // PERF: skip semantic LLM when candidate pack is too large for 3B (baseline: 18k chars → 60s timeout, evalCount=0).
  const maxPromptChars = Number(env.AI_G4_SEMANTIC_MAX_PROMPT_CHARS) || 10000;
  if (!skipLlm && needsSemanticLlm(selection) && policy.llm.semanticProjection.enabled) {
    const batches = packByTokenBudget(selection.candidates, {
      maxInputTokens: policy.llm.semanticProjection.maxInputTokens,
      maxCalls: policy.llm.semanticProjection.maxCalls,
    });
    for (const batch of batches) {
      const { buildSemanticPrompt } = require('./semanticProjection');
      const estChars = buildSemanticPrompt(batch).length;
      if (estChars > maxPromptChars) {
        stageTimings.g4_semantic.skipReason = 'prompt_too_large';
        stageTimings.g4_semantic.promptChars = estChars;
        partial = true;
        lastError = 'semantic_prompt_too_large';
        // eslint-disable-next-line no-console
        console.info(
          '[g4] skip semantic promptChars=%d max=%d candidates=%d',
          estChars,
          maxPromptChars,
          batch.length
        );
        break;
      }
      const sem = await runSemanticProjection({
        generateJson: generate,
        batch,
        policy: policy.llm.semanticProjection,
        requireEvidence: policy.evidence.required,
        env,
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

  await emitProgress(opts.onProgress, 'conflict');
  if (
    !skipLlm &&
    needsConflictLlm(selection) &&
    policy.llm.conflictAnalysis.enabled
  ) {
    const relationBatch = Array.isArray(selection.conflicts?.relations)
      ? selection.conflicts.relations.slice(0, 20)
      : [];
    const conf = await runConflictProjection({
      generateJson: generate,
      // Slim context: potential pairs only (not full FR list)
      batch: relationBatch.length
        ? relationBatch.map((rel) => ({
            pairKey: rel.pairKey,
            frIds: rel.frIds,
            targetKey: rel.targetKey,
            constraintType: rel.constraintType,
            relation: rel.relation,
            evidence: rel.evidence,
            facts: (constraintFacts || []).filter((f) =>
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
      env,
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
  await emitProgress(opts.onProgress, 'validate');
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

  let synthesis = null;
  await emitProgress(opts.onProgress, 'synthesis');
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
      env,
    });
    llmCalls += syn.llmCalls || 0;
    stageTimings.g4_synthesis.ms += Number(syn.durationMs) || 0;
    stageTimings.g4_synthesis.calls += Number(syn.llmCalls) || 0;
    stageTimings.g4_synthesis.evalCount += Number(syn.evalCount) || 0;
    stageTimings.g4_synthesis.promptChars += Number(syn.promptChars) || 0;
    if (syn.ok) synthesis = syn.summary;
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

  await emitProgress(opts.onProgress, 'evidence');
  const evidence = buildEvidenceBundle({
    snapshotId: projected.snapshotId,
    toolEvidence,
    semanticItems,
    conflicts,
    validation,
  });

  const llmStatus =
    llmCalls === 0 ? 'skipped' : llmFailed > 0 || partial ? 'partial' : 'ok';

  const g4Understanding = {
    requirements,
    relationships: validation.accepted,
    ambiguities,
    assumptions,
    evidence,
    rejectedRelationships: validation.rejected,
    facts: toolResult.facts || {},
    semanticItems,
    conflicts,
    synthesis,
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
      durationMs: Math.max(0, Date.now() - startedAt),
      validationOk: validation.ok,
      candidateCount: selection.counts.candidates,
      clearCount: selection.counts.clear,
      stageTimings,
      llm: {
        status: llmStatus,
        calls: llmCalls,
        failed: llmFailed,
      },
    },
  };

  console.info(
    `[g4] stage=pipeline candidates=${selection.counts.candidates} llmCalls=${llmCalls} partial=${g4Understanding.meta.partial} stageTimings=%s`,
    JSON.stringify(stageTimings)
  );

  return {
    g4Understanding,
    projected,
    validation,
    skill: skillLoad.skill,
    model: modelInfo,
    selection,
    contextPackage,
    corpusContentHash,
  };
}

module.exports = {
  PROMPT_VERSION,
  runG4Pipeline,
  runUnderstandPrefix,
  hasResumePartial,
};
