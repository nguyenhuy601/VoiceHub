/**
 * G4 Understanding pipeline (Waves 2–5):
 * Normalize → Signals → Candidates → [data gate] → Semantic LLM → Validate → Conflict → Evidence → Synthesis
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
const { packByTokenBudget } = require('./tokenPack');
const {
  runSemanticProjection,
  runConflictProjection,
} = require('./semanticProjection');
const { buildEvidenceBundle } = require('./evidenceBuilder');
const { runSynthesis } = require('./synthesis');
const { substepMeta, buildGatePreview } = require('./pipelineProgress');

const PROMPT_VERSION = 'g4-semantic-pipeline-v1';

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
  const selection = selectCandidates(signals, {
    enabled: policy.candidateSelection.enabled,
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

  if (opts.pauseAtDataGate && !hasResumePartial(opts.priorPartial)) {
    await emitProgress(opts.onProgress, 'gate_preview');
    return {
      paused: true,
      gate: 'data_review',
      gatePreview: buildGatePreview(prefix),
      partial: prefix,
    };
  }

  const {
    functionalRequirements,
    selection,
    projected,
    toolResult,
    toolEvidence,
  } = prefix;

  let llmCalls = 0;
  let llmFailed = 0;
  let partial = false;
  let lastError = null;
  const semanticItems = [];
  let conflicts = [];

  const skipLlm = Boolean(opts.forceHeuristic || opts.skipLlm || !policy.pipelineEnabled);

  await emitProgress(opts.onProgress, 'semantic');
  if (!skipLlm && needsSemanticLlm(selection) && policy.llm.semanticProjection.enabled) {
    const batches = packByTokenBudget(selection.candidates, {
      maxInputTokens: policy.llm.semanticProjection.maxInputTokens,
      maxCalls: policy.llm.semanticProjection.maxCalls,
    });
    for (const batch of batches) {
      const sem = await runSemanticProjection({
        generateJson: generate,
        batch,
        policy: policy.llm.semanticProjection,
        requireEvidence: policy.evidence.required,
        env,
      });
      llmCalls += sem.llmCalls || 0;
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
  }

  await emitProgress(opts.onProgress, 'conflict');
  if (
    !skipLlm &&
    needsConflictLlm(selection) &&
    policy.llm.conflictAnalysis.enabled
  ) {
    const conflictBatch = selection.candidates.filter((c) =>
      c.reasons?.includes('conflict')
    );
    const conf = await runConflictProjection({
      generateJson: generate,
      batch: conflictBatch.slice(0, 20),
      policy: policy.llm.conflictAnalysis,
      env,
    });
    llmCalls += conf.llmCalls || 0;
    if (!conf.ok) {
      llmFailed += 1;
      partial = true;
      lastError = conf.error || lastError;
    } else {
      conflicts = conf.conflicts || [];
    }
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
    if (syn.ok) synthesis = syn.summary;
    else {
      llmFailed += 1;
      partial = true;
      lastError = syn.error || lastError;
    }
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
      llm: {
        status: llmStatus,
        calls: llmCalls,
        failed: llmFailed,
      },
    },
  };

  console.info(
    `[g4] stage=pipeline candidates=${selection.counts.candidates} llmCalls=${llmCalls} partial=${g4Understanding.meta.partial}`
  );

  return {
    g4Understanding,
    projected,
    validation,
    skill: skillLoad.skill,
    model: modelInfo,
    selection,
  };
}

module.exports = {
  PROMPT_VERSION,
  runG4Pipeline,
};
