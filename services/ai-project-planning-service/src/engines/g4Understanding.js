/**
 * G4 Requirement Understanding pipeline:
 * projection → LLM extract (optional chunks) → RequirementAnalysisTool → validate relationships.
 */

const { requirementUnderstandingSkill } = require('../skills/requirementUnderstanding.skill');
const { selectModel, loadSkillStub } = require('../runtime/intelligenceRuntime');
const { generateJson } = require('../runtime/ollamaGenerate');
const { invokeTool } = require('../registry/toolRegistry');
const { registerDefaultTools } = require('../tools/registerDefaultTools');
const { validateRelationships } = require('../validation/relationshipValidator');
const { createEvidence } = require('../evidence/evidence');
const { listFrs } = require('../tools/requirementAnalysis');

const PROMPT_VERSION = 'g4-understanding-v1';
const FR_CHUNK_SIZE = 16;
const MAX_LLM_CHUNKS = 6;
const DEFAULT_WALL_MS = 180_000;

function projectWhatSnapshot(snapshot = {}) {
  const frs = listFrs(snapshot).slice(0, 200);
  return {
    snapshotId: snapshot.snapshotId || snapshot.id || null,
    packId: snapshot.packId || null,
    overview: {
      requirementName: snapshot.overview?.requirementName || snapshot.overview?.name || null,
      summary: snapshot.overview?.summary || snapshot.overview?.description || null,
    },
    functionalRequirements: frs.map((fr, i) => ({
      id: String(fr.id || fr._id || fr.externalId || `FR-${i + 1}`),
      title: fr.title || fr.name || null,
      description: String(fr.description || '').slice(0, 400),
      ac: String(fr.ac || fr.acceptanceCriteria || '').slice(0, 200),
      priority: fr.priority || null,
      module: fr.module || null,
      feature: fr.feature || null,
      parentId: fr.parentId || fr.parentExternalId || null,
      dependency: fr.dependency || fr.dependsOn || null,
      level: fr.level || 'Requirement',
    })),
    // RULE-06: no employees / calendar in WHAT projection
  };
}

function chunkArray(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function buildExtractPrompt(projected, chunkFrs) {
  return [
    'You are Requirement Understanding (G4). Extract structured JSON only.',
    'Do NOT invent coverage scores, effort, schedule, or employee assignments.',
    'Return JSON: { "relationships":[{"from","to","type","note"}], "ambiguities":[{"requirementId","kind","message"}], "assumptions":[{"kind","message"}] }',
    `Project: ${projected.overview?.requirementName || 'n/a'}`,
    `FR chunk (${chunkFrs.length}):`,
    JSON.stringify(chunkFrs),
  ].join('\n');
}

function mergeLlmCandidates(chunksData = []) {
  const relationships = [];
  const ambiguities = [];
  const assumptions = [];
  for (const data of chunksData) {
    if (!data || typeof data !== 'object') continue;
    if (Array.isArray(data.relationships)) relationships.push(...data.relationships);
    if (Array.isArray(data.ambiguities)) ambiguities.push(...data.ambiguities);
    if (Array.isArray(data.assumptions)) assumptions.push(...data.assumptions);
  }
  return { relationships, ambiguities, assumptions };
}

/**
 * Attach evidence stubs to LLM relationship candidates (RULE-10).
 */
function attachLlmRelationshipEvidence(rels, snapshotId) {
  return (rels || []).map((rel) => {
    if (Array.isArray(rel.evidence) && rel.evidence.length) return rel;
    const ev = createEvidence({
      sourceType: 'llm_candidate',
      sourceId: String(rel.from || ''),
      snapshotId,
      metric: 'relationship_candidate',
      value: String(rel.to || ''),
      calculatedBy: 'G17:requirementUnderstanding',
      ruleId: 'G4-LLM-REL-001',
    });
    return { ...rel, evidence: [ev], confidence: rel.confidence != null ? rel.confidence : 0.5 };
  });
}

/**
 * @param {{ snapshot?: object, pack?: object, env?: object, generateJsonFn?: Function, wallMs?: number, forceHeuristic?: boolean }} opts
 */
async function runG4Understanding(opts = {}) {
  registerDefaultTools();
  const startedAt = Date.now();
  const env = opts.env || process.env;
  const wallMs = opts.wallMs ?? DEFAULT_WALL_MS;
  const snapshot = opts.snapshot || opts.pack || {};
  const projected = projectWhatSnapshot(snapshot);
  const skillLoad = loadSkillStub(requirementUnderstandingSkill);
  const modelInfo = selectModel(env);
  const generate = opts.generateJsonFn || generateJson;

  let llmCalls = 0;
  let partial = false;
  let lastError = null;
  const llmChunkData = [];

  const frChunks = chunkArray(projected.functionalRequirements, FR_CHUNK_SIZE).slice(
    0,
    MAX_LLM_CHUNKS
  );

  if (!opts.forceHeuristic && frChunks.length) {
    for (const chunk of frChunks) {
      if (Date.now() - startedAt > wallMs) {
        partial = true;
        lastError = 'wall_budget';
        break;
      }
      const prompt = buildExtractPrompt(projected, chunk);
      const result = await generate({
        prompt,
        numPredict: 512,
        numCtx: 4096,
        timeoutMs: Math.min(120000, wallMs - (Date.now() - startedAt)),
        env,
      });
      llmCalls += result.skipped ? 0 : 1;
      if (result.ok && result.data) {
        llmChunkData.push(result.data);
      } else if (!result.skipped) {
        partial = true;
        lastError = result.error || 'ollama_error';
      }
    }
  }

  const llmMerged = mergeLlmCandidates(llmChunkData);

  const toolOut = await invokeTool(
    'RequirementAnalysisTool',
    { ...projected, snapshotId: projected.snapshotId, packId: projected.packId },
    {
      contextName: 'understanding',
      requiresSatisfied: { snapshot: true },
    }
  );

  const toolResult = toolOut?.result || {};
  const toolEvidence = Array.isArray(toolOut?.evidence) ? toolOut.evidence : [];

  const requirements = Array.isArray(toolResult.requirements)
    ? toolResult.requirements
    : projected.functionalRequirements;

  const llmRels = attachLlmRelationshipEvidence(llmMerged.relationships, projected.snapshotId);
  const combinedRels = [
    ...(Array.isArray(toolResult.relationships) ? toolResult.relationships : []),
    ...llmRels,
  ];

  const validation = validateRelationships({
    requirements,
    relationships: combinedRels,
  });

  const ambiguities = [
    ...(Array.isArray(toolResult.ambiguities) ? toolResult.ambiguities : []),
    ...llmMerged.ambiguities,
  ];
  const assumptions = [
    ...(Array.isArray(toolResult.assumptions) ? toolResult.assumptions : []),
    ...llmMerged.assumptions,
  ];

  if (!validation.ok) {
    for (const err of validation.errors) {
      if (err.code === 'REL_CIRCULAR') {
        ambiguities.push({
          kind: 'circular_relationship',
          cycle: err.cycle,
          message: 'Circular relationship rejected',
        });
      }
    }
  }

  const evidence = [
    ...toolEvidence,
    ...validation.accepted.flatMap((r) => r.evidence || []),
  ];

  const g4Understanding = {
    requirements,
    relationships: validation.accepted,
    ambiguities,
    assumptions,
    evidence,
    rejectedRelationships: validation.rejected,
    facts: toolResult.facts || {},
    meta: {
      model: llmCalls > 0 ? modelInfo.model : null,
      skillId: skillLoad.skill?.skillId || requirementUnderstandingSkill.skillId,
      skillVersion: skillLoad.skill?.version || requirementUnderstandingSkill.version,
      promptVersion: PROMPT_VERSION,
      llmCalls,
      partial: Boolean(partial || !validation.ok),
      lastError,
      durationMs: Math.max(0, Date.now() - startedAt),
      validationOk: validation.ok,
    },
  };

  return {
    g4Understanding,
    projected,
    validation,
    skill: skillLoad.skill,
    model: modelInfo,
  };
}

module.exports = {
  PROMPT_VERSION,
  FR_CHUNK_SIZE,
  MAX_LLM_CHUNKS,
  projectWhatSnapshot,
  runG4Understanding,
};
