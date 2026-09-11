/**
 * Hierarchy decomposition heuristics — Module→Feature / Feature→Requirement.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildHeuristicFeatureProposals,
  buildHeuristicRequirementProposals,
  runHierarchyDecomposition,
  toSlimModuleParent,
  toSlimFeatureParent,
  buildHierarchyParentChunks,
  canStartChunk,
  HIERARCHY_PARENT_CHUNK,
} = require('../src/utils/aiAnalysis/aiAnalysisHierarchy');
const {
  buildModuleSlices,
  buildFeatureSlices,
} = require('../src/utils/aiAnalysis/aiAnalysisFrSlice');

describe('aiAnalysisHierarchy', () => {
  it('Module-only pack proposes Features and cascaded Requirements', async () => {
    const pack = {
      functionalRequirements: [
        {
          externalId: 'FR-001',
          level: 'Module',
          parentExternalId: '',
          name: 'Authentication',
          description: 'Login. Session. Password reset.',
        },
      ],
    };

    const moduleSlices = buildModuleSlices(pack);
    assert.equal(moduleSlices.length, 1);
    assert.deepEqual(moduleSlices[0].childFeatureIds, []);

    const features = buildHeuristicFeatureProposals(moduleSlices);
    assert.ok(features.length >= 1 && features.length <= 3);
    assert.ok(features.every((p) => p.level === 'Feature'));
    assert.ok(features.every((p) => p.parentExternalId === 'FR-001'));
    assert.ok(features.every((p) => String(p.proposalId).startsWith('PROP-F-FR-001-')));
    assert.ok(features.every((p) => p.source === 'heuristic'));

    const prev = process.env.AI_PLANNING_LLM;
    process.env.AI_PLANNING_LLM = '0';
    try {
      const result = await runHierarchyDecomposition(pack, { forceHeuristic: true });
      assert.ok(result.proposedFeatures.length >= 1);
      assert.ok(result.proposedRequirements.length >= 1);
      const featureIds = new Set(result.proposedFeatures.map((p) => p.proposalId));
      assert.ok(
        result.proposedRequirements.every((r) => featureIds.has(r.parentExternalId)),
        'cascaded Requirements must parent to proposed Feature proposalIds'
      );
    } finally {
      if (prev === undefined) delete process.env.AI_PLANNING_LLM;
      else process.env.AI_PLANNING_LLM = prev;
    }
  });

  it('Module+Feature pack proposes Requirements for childless Features', async () => {
    const pack = {
      functionalRequirements: [
        {
          externalId: 'FR-001',
          level: 'Module',
          parentExternalId: '',
          name: 'Billing',
          description: 'Payments module',
        },
        {
          externalId: 'FR-002',
          level: 'Feature',
          parentExternalId: 'FR-001',
          name: 'Invoicing',
          description: 'Create invoice. Send invoice. Void invoice.',
          mainFlow: 'User opens invoice form',
        },
      ],
    };

    const featureSlices = buildFeatureSlices(pack);
    assert.equal(featureSlices.length, 1);
    assert.deepEqual(featureSlices[0].childRequirementIds, []);

    const requirements = buildHeuristicRequirementProposals(featureSlices);
    assert.ok(requirements.length >= 1 && requirements.length <= 3);
    assert.ok(requirements.every((p) => p.level === 'Requirement'));
    assert.ok(requirements.every((p) => p.parentExternalId === 'FR-002'));
    assert.ok(requirements.every((p) => String(p.proposalId).startsWith('PROP-R-FR-002-')));

    const featureProposals = buildHeuristicFeatureProposals(buildModuleSlices(pack));
    assert.equal(featureProposals.length, 0);
  });

  it('does not duplicate children when Requirements already exist', async () => {
    const pack = {
      functionalRequirements: [
        {
          externalId: 'FR-001',
          level: 'Module',
          parentExternalId: '',
          name: 'Core',
        },
        {
          externalId: 'FR-002',
          level: 'Feature',
          parentExternalId: 'FR-001',
          name: 'Profile',
        },
        {
          externalId: 'FR-003',
          level: 'Requirement',
          parentExternalId: 'FR-002',
          name: 'Edit profile',
        },
      ],
    };

    const moduleSlices = buildModuleSlices(pack);
    const featureSlices = buildFeatureSlices(pack);
    assert.ok(moduleSlices[0].childFeatureIds.includes('FR-002'));
    assert.ok(featureSlices[0].childRequirementIds.includes('FR-003'));

    assert.deepEqual(buildHeuristicFeatureProposals(moduleSlices), []);
    assert.deepEqual(buildHeuristicRequirementProposals(featureSlices), []);

    const prev = process.env.AI_PLANNING_LLM;
    process.env.AI_PLANNING_LLM = '0';
    try {
      const result = await runHierarchyDecomposition(pack, { forceHeuristic: true });
      assert.equal(result.proposedFeatures.length, 0);
      assert.equal(result.proposedRequirements.length, 0);
    } finally {
      if (prev === undefined) delete process.env.AI_PLANNING_LLM;
      else process.env.AI_PLANNING_LLM = prev;
    }
  });

  it('toSlimModuleParent / toSlimFeatureParent omit child arrays', () => {
    const slimMod = toSlimModuleParent({
      id: 'M1',
      title: 'Auth',
      description: 'Login flow',
      childFeatureIds: ['F1'],
      childFeatureTitles: ['Login'],
    });
    assert.deepEqual(Object.keys(slimMod).sort(), ['description', 'id', 'title']);
    assert.equal(slimMod.id, 'M1');
    assert.equal(slimMod.childFeatureIds, undefined);

    const slimFeat = toSlimFeatureParent({
      id: 'F1',
      title: 'Login',
      description: 'Sign in',
      mainFlow: 'User submits form',
      childRequirementIds: ['R1'],
      childRequirementTitles: ['Form'],
    });
    assert.deepEqual(Object.keys(slimFeat).sort(), ['description', 'id', 'mainFlow', 'title']);
    assert.equal(slimFeat.childRequirementIds, undefined);
  });

  it('buildHierarchyParentChunks batches by total parent count', () => {
    assert.equal(HIERARCHY_PARENT_CHUNK, 8);
    const modules = Array.from({ length: 5 }, (_, i) => ({
      id: `M${i + 1}`,
      title: `Mod ${i + 1}`,
      childFeatureIds: [],
    }));
    const features = Array.from({ length: 6 }, (_, i) => ({
      id: `F${i + 1}`,
      title: `Feat ${i + 1}`,
      childRequirementIds: [],
    }));
    const chunks = buildHierarchyParentChunks(modules, features, 8);
    assert.equal(chunks.length, 2);
    assert.equal(chunks[0].modules.length + chunks[0].features.length, 8);
    assert.equal(chunks[1].modules.length + chunks[1].features.length, 3);
    assert.equal(chunks[0].modules.length, 5);
    assert.equal(chunks[0].features.length, 3);
  });

  it('canStartChunk is inclusive on wall boundary', () => {
    assert.equal(canStartChunk(0, 120_000, 60_000), true);
    assert.equal(canStartChunk(60_000, 120_000, 60_000), true);
    assert.equal(canStartChunk(60_001, 120_000, 60_000), false);
  });

  it('wall_budget stops before second chunk and keeps heuristic', async () => {
    const pack = {
      functionalRequirements: Array.from({ length: 10 }, (_, i) => ({
        externalId: `FR-M${i + 1}`,
        level: 'Module',
        parentExternalId: '',
        name: `Module ${i + 1}`,
        description: 'Core. Details. Extra.',
      })),
    };

    let calls = 0;
    const result = await runHierarchyDecomposition(pack, {
      wallMs: 80,
      chunkTimeoutMs: 80,
      chunkSize: 8,
      generateJson: async () => {
        calls += 1;
        // Ensure elapsed > 0 before next canStartChunk check.
        await new Promise((r) => setTimeout(r, 5));
        return {
          ok: true,
          data: {
            proposedFeatures: [
              {
                proposalId: 'LLM-1',
                parentExternalId: 'FR-M1',
                name: 'LLM Feature',
                source: 'llm',
              },
            ],
            proposedRequirements: [],
          },
        };
      },
    });

    assert.equal(calls, 1);
    assert.equal(result.meta.llmCalls, 1);
    assert.equal(result.meta.partial, true);
    assert.equal(result.meta.error, 'wall_budget');
    assert.ok(result.meta.wallBudgetSkippedInputCount >= 1);
    assert.equal(result.meta.wallBudgetSkippedInputKind, 'parent');
    assert.ok(result.proposedFeatures.length >= 1);
    assert.ok(result.proposedFeatures.some((p) => p.source === 'heuristic'));
    assert.ok(typeof result.meta.elapsedMs === 'number');
  });

  it('failed LLM chunk falls back to heuristic proposals', async () => {
    const pack = {
      functionalRequirements: [
        {
          externalId: 'FR-001',
          level: 'Module',
          parentExternalId: '',
          name: 'Auth',
          description: 'Login. Session.',
        },
      ],
    };

    const result = await runHierarchyDecomposition(pack, {
      wallMs: 120_000,
      chunkTimeoutMs: 60_000,
      generateJson: async () => ({ ok: false, error: 'ollama_timeout', data: null }),
    });

    assert.equal(result.meta.llmCalls, 1);
    assert.equal(result.meta.partial, true);
    assert.equal(result.meta.error, 'ollama_timeout');
    assert.ok(result.proposedFeatures.length >= 1);
    assert.ok(result.proposedFeatures.every((p) => p.source === 'heuristic'));
  });
});
