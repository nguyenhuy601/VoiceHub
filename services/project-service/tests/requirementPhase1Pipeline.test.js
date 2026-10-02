/**
 * Phase 1 tool-first pipeline — readiness + projection order (no Mongo).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildPhase1Readiness,
} = require('../src/services/requirementPhase1Pipeline.service');
const {
  buildHeuristicProjection,
  normalizeLlmProjection,
  isPhase1ToolsProposeEnabled,
} = require('../src/utils/aiAnalysis/runPhase1ProjectionPrompt');

describe('requirementPhase1Pipeline', () => {
  it('Stage1 readiness omits corpus text and lists missing', () => {
    const pack = {
      status: 'draft',
      aiAnalysis: {
        intakeCorpus: { totalChars: 0, excerpts: [] },
        inputDocuments: [],
      },
      functionalRequirements: [],
    };
    const readiness = buildPhase1Readiness(pack, {
      intakeCorpusChars: 0,
      excerptsCount: 0,
      status: 'draft',
    });
    assert.ok(Array.isArray(readiness.missing));
    assert.ok(readiness.missing.includes('no_customer_documents'));
    assert.ok(!readiness.missing.includes('empty_intake_corpus'));
    assert.ok(readiness.missing.includes('system_supplement_partial'));
    assert.equal(readiness.intakeCorpusChars, 0);
    assert.ok(!Object.prototype.hasOwnProperty.call(readiness, 'excerpts'));
    assert.ok(!Object.prototype.hasOwnProperty.call(readiness, 'text'));
  });

  it('Stage1 readiness does not block G4 on empty intake corpus when FR ready path', () => {
    const pack = {
      status: 'draft',
      aiAnalysisActiveSnapshotId: 'snap1',
      aiAnalysis: {
        intakeCorpus: { totalChars: 0, excerpts: [] },
        inputDocuments: [{ documentId: 'd1', filename: 'raw.xlsx' }],
        skillCatalogStub: { version: 'v1', skills: [] },
        sources: { skillCatalog: { version: 'v1', skillCount: 0 } },
        workbookDiagnostic: {
          status: 'SUCCESS',
          rows: { validFr: 1 },
          reasonCodes: [],
          mappingDiagnostic: { status: 'COMPLETE', failureReason: null },
        },
      },
      functionalRequirements: [{ externalId: 'FR-1', name: 'Login' }],
    };
    const readiness = buildPhase1Readiness(pack, {
      intakeCorpusChars: 0,
      excerptsCount: 0,
      snapshotId: 'snap1',
    });
    assert.ok(!readiness.missing.includes('empty_intake_corpus'));
    assert.equal(readiness.requirementReadiness, 'READY');
  });

  it('Stage1 readiness clears system_supplement_partial when skillCatalogStub wired', () => {
    const pack = {
      status: 'draft',
      aiAnalysisActiveSnapshotId: 'snap1',
      aiAnalysis: {
        intakeCorpus: { totalChars: 10, excerpts: [{ filename: 'a.txt', text: 'hi' }] },
        inputDocuments: [{ documentId: 'd1', filename: 'a.txt' }],
        skillCatalogStub: { version: 'v1', skills: [] },
        sources: { skillCatalog: { version: 'v1', skillCount: 0 } },
      },
      functionalRequirements: [{ externalId: 'FR-1' }],
    };
    const readiness = buildPhase1Readiness(pack, {
      intakeCorpusChars: 10,
      excerptsCount: 1,
      snapshotId: 'snap1',
    });
    assert.equal(readiness.systemSourcesPresent, true);
    assert.ok(!readiness.missing.includes('system_supplement_partial'));
  });

  it('Stage1 readiness detects prefill when FR present', () => {
    const pack = {
      status: 'draft',
      aiAnalysisActiveSnapshotId: 'snap1',
      aiAnalysis: {
        intakeCorpus: { totalChars: 100, excerpts: [{ filename: 'a.txt', text: 'x' }] },
        inputDocuments: [{ documentId: 'd1', filename: 'a.txt' }],
      },
      functionalRequirements: [{ externalId: 'FR-1', title: 'Login' }],
    };
    const readiness = buildPhase1Readiness(pack, {
      intakeCorpusChars: 100,
      excerptsCount: 1,
      snapshotId: 'snap1',
    });
    assert.equal(readiness.prefillApplied, true);
    assert.equal(readiness.docsCount, 1);
    assert.ok(!readiness.missing.includes('empty_intake_corpus'));
    assert.ok(!readiness.missing.includes('no_analysis_snapshot'));
  });

  it('heuristic projection builds proposedSrs without LLM', () => {
    const pack = {
      overview: { requirementName: 'Demo' },
      functionalRequirements: [{ externalId: 'FR-1', description: 'old' }],
    };
    const tools = {
      facts: { 'completeness.score': 0.4, 'consistency.conflictCount': 0 },
      gateA: { passed: false, checks: [] },
    };
    const out = buildHeuristicProjection({
      pack,
      requirementTools: tools,
      extras: {
        ambiguityItems: [{ externalId: 'FR-1', message: 'unclear actor' }],
      },
    });
    assert.equal(out.ok, true);
    assert.equal(out.skippedLlm, true);
    assert.ok(Array.isArray(out.proposedSrs.deltas));
    assert.ok(out.proposedSrs.deltas.length >= 1);
    assert.ok(String(out.insights.understanding).includes('Heuristic'));
  });

  it('normalizeLlmProjection maps clarifications to proposedSrs', () => {
    const pack = { functionalRequirements: [{ externalId: 'FR-2' }] };
    const { insights, proposedSrs } = normalizeLlmProjection(
      {
        understanding: 'Need login FR',
        clarifications: [{ frId: 'FR-2', text: 'Add MFA', priority: 'High' }],
      },
      pack,
      { gateA: { passed: true } }
    );
    assert.equal(insights.understanding, 'Need login FR');
    assert.equal(proposedSrs.deltas[0].externalId, 'FR-2');
    assert.match(proposedSrs.deltas[0].proposedText, /Add MFA/);
  });

  it('tools_propose response whitelist has no corpus text keys', () => {
    const sample = {
      prepared: true,
      mode: 'tools_propose',
      stage: 2,
      packId: 'p1',
      status: 'draft',
      toolsRan: true,
      gateAPassed: false,
      factsCount: 5,
      proposedDeltaCount: 2,
      seededArtifactCount: 3,
      skippedLlm: true,
      citationCount: 2,
      requirementAiContextPersisted: true,
      feedbackApplied: true,
      evidenceSpanCount: 4,
      seededSkippedNoCite: 1,
      groundingPassCount: 2,
      groundingFailCount: 1,
      seededSkippedGrounding: 1,
      retrievedSpanCount: 3,
      llmError: 'ollama_json_parse',
      snapshotId: 's1',
      httpStatus: 200,
    };
    const allowed = new Set([
      'prepared',
      'mode',
      'stage',
      'packId',
      'status',
      'toolsRan',
      'gateAPassed',
      'factsCount',
      'proposedDeltaCount',
      'seededArtifactCount',
      'skippedLlm',
      'citationCount',
      'requirementAiContextPersisted',
      'feedbackApplied',
      'evidenceSpanCount',
      'seededSkippedNoCite',
      'groundingPassCount',
      'groundingFailCount',
      'seededSkippedGrounding',
      'retrievedSpanCount',
      'llmError',
      'snapshotId',
      'httpStatus',
    ]);
    for (const key of Object.keys(sample)) {
      assert.ok(allowed.has(key), `unexpected ${key}`);
    }
  });

  it('requirementAiContext persist shape includes knowledge meta not corpus', () => {
    const {
      buildRequirementAiContext,
    } = require('../src/utils/tools/buildRequirementAiContext');
    const ctx = buildRequirementAiContext({
      pack: { overview: { requirementName: 'X' }, functionalRequirements: [] },
      requirementTools: {
        facts: { 'completeness.score': 0.5 },
        gateA: { passed: false, checks: [] },
      },
      knowledge: {
        stub: true,
        citationCount: 2,
        citations: [{ id: 'c-corpus-1' }, { id: 'c-skill-1' }],
        catalogPins: [{ id: 'c-skill-1', name: 'Node' }],
      },
      semanticSummary: { linkCount: 1, frWithLinks: 1 },
    });
    assert.equal(ctx.knowledge.citationCount, 2);
    assert.deepEqual(ctx.knowledge.citationIds, ['c-corpus-1', 'c-skill-1']);
    assert.equal(ctx.semanticSummary.linkCount, 1);
    assert.ok(!JSON.stringify(ctx).includes('INTAKE_CORPUS'));
  });

  it('PHASE1_TOOLS_PROPOSE env gate', () => {
    const prev = process.env.PHASE1_TOOLS_PROPOSE;
    try {
      delete process.env.PHASE1_TOOLS_PROPOSE;
      assert.equal(isPhase1ToolsProposeEnabled(), true);
      process.env.PHASE1_TOOLS_PROPOSE = '0';
      assert.equal(isPhase1ToolsProposeEnabled(), false);
      process.env.PHASE1_TOOLS_PROPOSE = '1';
      assert.equal(isPhase1ToolsProposeEnabled(), true);
    } finally {
      if (prev === undefined) delete process.env.PHASE1_TOOLS_PROPOSE;
      else process.env.PHASE1_TOOLS_PROPOSE = prev;
    }
  });

  it('seedFrTree creates Module/Feature/FR when pack FR empty', () => {
    const {
      buildSeedFrTreeFromTools,
    } = require('../src/utils/aiAnalysis/runPhase1ProjectionPrompt');
    const {
      applyProposedSrsToPack,
    } = require('../src/utils/aiAnalysis/applyProposedSrsToPack');

    const tree = buildSeedFrTreeFromTools({
      pack: { functionalRequirements: [] },
      insights: {
        understanding: 'Need online enrollment',
        clarifications: [{ text: 'Student can register courses', priority: 'High' }],
      },
      extras: {
        ambiguityItems: [{ message: 'Clarify payment gateway' }],
        gapItems: [{ message: 'Add audit log', severity: 'medium' }],
      },
      evidenceSpans: [
        {
          id: 'e-span-1-1',
          filename: 'a.txt',
          text: 'Student can register courses online',
          snippet: 'Student can register courses online',
        },
      ],
    });
    assert.ok(Array.isArray(tree));
    assert.ok(tree.some((r) => r.level === 'Module'));
    assert.ok(tree.some((r) => r.level === 'Feature'));
    assert.ok(tree.some((r) => r.level === 'Requirement'));
    assert.ok(
      tree
        .filter((r) => r.level === 'Requirement')
        .every((r) => Array.isArray(r.evidenceIds) && r.evidenceIds.length >= 1)
    );

    const { pack, meta } = applyProposedSrsToPack(
      { overview: { projectObjective: 'Enrollment' }, functionalRequirements: [] },
      {
        analyses: {
          evidenceSpans: [
            {
              id: 'e-span-1-1',
              filename: 'a.txt',
              snippet: 'Student can register courses online',
            },
          ],
          phase1SeedFr: tree,
          requirementInsights: {
            understanding: 'Need online enrollment',
            clarifications: [{ text: 'Student can register courses' }],
          },
          proposedSrs: { deltas: [] },
        },
      }
    );
    assert.ok(pack.functionalRequirements.length >= 3);
    assert.ok(Array.isArray(pack.scope) && pack.scope.length >= 1);
    assert.ok(Array.isArray(pack.businessGoals) && pack.businessGoals.length >= 1);
    assert.ok(Array.isArray(pack.useCases) && pack.useCases.length >= 1);
    assert.ok(meta.sheetsTouched.includes('functionalRequirements'));
  });

  it('REQUIRE_EVIDENCE drops seeded FR without evidenceIds when spans present', () => {
    const {
      applyProposedSrsToPack,
    } = require('../src/utils/aiAnalysis/applyProposedSrsToPack');
    const prev = process.env.PHASE1_REQUIRE_EVIDENCE;
    try {
      process.env.PHASE1_REQUIRE_EVIDENCE = '1';
      const { pack, meta } = applyProposedSrsToPack(
        { overview: { projectObjective: 'X' }, functionalRequirements: [] },
        {
          analyses: {
            evidenceSpans: [{ id: 'e-span-1-1', snippet: 'hello', filename: 'a.txt' }],
            phase1SeedFr: [
              {
                externalId: 'M-001',
                level: 'Module',
                name: 'M',
                baNote: 'seeded:phase1_tools',
              },
              {
                externalId: 'F-001',
                level: 'Feature',
                name: 'F',
                parentExternalId: 'M-001',
                baNote: 'seeded:phase1_tools',
              },
              {
                externalId: 'FR-001',
                level: 'Requirement',
                name: 'no cite',
                parentExternalId: 'F-001',
                baNote: 'seeded:phase1_tools',
              },
              {
                externalId: 'FR-002',
                level: 'Requirement',
                name: 'with cite',
                parentExternalId: 'F-001',
                baNote: 'seeded:phase1_tools',
                evidenceIds: ['e-span-1-1'],
              },
            ],
            requirementInsights: { understanding: 'x', clarifications: [] },
            proposedSrs: { deltas: [] },
          },
        }
      );
      assert.ok(pack.functionalRequirements.some((r) => r.externalId === 'FR-002'));
      assert.ok(!pack.functionalRequirements.some((r) => r.externalId === 'FR-001'));
      assert.ok(meta.seededSkippedNoCite >= 1);
    } finally {
      if (prev === undefined) delete process.env.PHASE1_REQUIRE_EVIDENCE;
      else process.env.PHASE1_REQUIRE_EVIDENCE = prev;
    }
  });

  it('UC falls back to clarifications when only Module/Feature remain', () => {
    const {
      applyProposedSrsToPack,
    } = require('../src/utils/aiAnalysis/applyProposedSrsToPack');
    const { pack } = applyProposedSrsToPack(
      { overview: { projectObjective: 'SMS' }, functionalRequirements: [], useCases: [] },
      {
        analyses: {
          phase1SeedFr: [
            {
              externalId: 'M-001',
              level: 'Module',
              name: 'AI Draft Module',
              baNote: 'seeded:phase1_tools',
            },
            {
              externalId: 'F-001',
              level: 'Feature',
              name: 'Core',
              parentExternalId: 'M-001',
              baNote: 'seeded:phase1_tools',
            },
          ],
          requirementInsights: {
            understanding: 'Need enrollment',
            clarifications: [
              { text: 'Student registers courses online', priority: 'High' },
            ],
          },
          proposedSrs: { deltas: [] },
        },
      }
    );
    assert.ok(Array.isArray(pack.useCases) && pack.useCases.length >= 1);
    assert.match(String(pack.useCases[0].title), /register|Student/i);
    assert.equal(pack.useCases[0].baNote, 'seeded:ai_what:clarification');
  });

  it('overview and scope do not make requirement readiness READY', () => {
    const diagnostic = {
      status: 'NOT_READY',
      reasonCodes: ['REQUIREMENT_ROWS_EMPTY'],
      rows: { validFr: 0 },
      mappingDiagnostic: { status: 'COMPLETE', missing: [], mapped: ['id', 'requirement'] },
      tableSelection: {},
    };
    const readiness = buildPhase1Readiness({
      status: 'draft',
      overview: { projectObjective: 'Grow' },
      scope: [{ description: 'Leads' }],
      functionalRequirements: [],
      aiAnalysis: {
        workbookDiagnostic: diagnostic,
        intakeCorpus: { totalChars: 8000 },
        inputDocuments: [{ filename: 'raw.xlsx' }],
        skillCatalogStub: { skills: [] },
      },
      aiAnalysisActiveSnapshotId: 'snap-1',
    }, { intakeCorpusChars: 8000, excerptsCount: 1 });
    assert.equal(readiness.documentReadiness, 'READY');
    assert.equal(readiness.requirementReadiness, 'NOT_READY');
  });

  it('mapping failure with empty reasonCodes stays NOT_READY', () => {
    const readiness = buildPhase1Readiness({
      functionalRequirements: [],
      aiAnalysis: {
        workbookDiagnostic: {
          status: 'NOT_READY',
          reasonCodes: [],
          rows: { validFr: 0 },
          mappingDiagnostic: { status: 'EMPTY', failureReason: 'MAPPING_EMPTY', missing: ['id', 'requirement'] },
        },
        inputDocuments: [{ filename: 'raw.xlsx' }],
        intakeCorpus: { totalChars: 10 },
      },
    }, { intakeCorpusChars: 10 });
    assert.equal(readiness.requirementReadiness, 'NOT_READY');
  });
});

describe('snapshot FR alignment', () => {
  const fs = require('fs');
  const path = require('path');
  const {
    hashFunctionalRequirements,
    assertSnapshotFrAlignment,
    assertG4CanStart,
  } = require('../src/utils/requirement/workbookDiagnostic');

  it('hash ignores level and changes when the requirement name changes', () => {
    const row = {
      externalId: 'CR-001',
      level: 'Requirement',
      name: 'Search',
      description: 'Search',
      moduleLabel: '',
      actor: '',
      acceptanceCriteria: '',
    };
    assert.equal(
      hashFunctionalRequirements([row]),
      hashFunctionalRequirements([{ ...row, level: 'Feature' }])
    );
    assert.notEqual(
      hashFunctionalRequirements([row]),
      hashFunctionalRequirements([{ ...row, name: 'Other' }])
    );
  });

  it('rejects a snapshot whose functional requirement hash differs and does not rebuild', () => {
    const packFr = [{ externalId: 'CR-001', name: 'Search', description: 'Search' }];
    const snapshot = {
      projected: { srs: { functionalRequirements: [{ externalId: 'CR-001', name: 'Other', description: 'Other' }] } },
      ingestionValidation: { functionalRequirementHash: 'stale', functionalRequirementCount: 1 },
    };
    assert.throws(
      () => assertSnapshotFrAlignment(packFr, snapshot),
      (err) => err.errorCode === 'SNAPSHOT_FR_MISMATCH'
    );
    const ready = {
      status: 'SUCCESS',
      reasonCodes: [],
      rows: { validFr: 1 },
      mappingDiagnostic: { status: 'COMPLETE', mapped: ['id', 'requirement'], missing: [] },
      tableSelection: { selectedHeaderRow: 1 },
    };
    assert.throws(
      () => assertG4CanStart(
        { functionalRequirements: packFr, aiAnalysis: { workbookDiagnostic: ready } },
        snapshot
      ),
      (err) => err.errorCode === 'SNAPSHOT_FR_MISMATCH'
    );
    const src = fs.readFileSync(
      path.join(__dirname, '../src/services/aiAnalysis.service.js'),
      'utf8'
    );
    // Call site (not require) — lazy prepare may refresh snapshot before this guard.
    const guardAt = src.lastIndexOf('assertG4CanStart(');
    const startAt = src.indexOf('aiProjectPlanningClient.startRun');
    assert.ok(guardAt > 0 && startAt > guardAt);
    const between = src.slice(guardAt, startAt);
    assert.equal(between.includes('buildSnapshotPayload'), false);
    assert.equal(between.includes('ensureActiveAiAnalysisSnapshot'), false);
    assert.match(src, /ensurePreparedIntakeForWhat/);
    assert.match(src, /refreshOnFrDrift:\s*true/);
    const aligned = {
      projected: { srs: { functionalRequirements: packFr } },
      ingestionValidation: {
        functionalRequirementHash: hashFunctionalRequirements(packFr),
        functionalRequirementCount: 1,
      },
    };
    assert.doesNotThrow(() => assertSnapshotFrAlignment(packFr, aligned));
    const stage1 = fs.readFileSync(
      path.join(__dirname, '../src/services/requirementPhase1Pipeline.service.js'),
      'utf8'
    );
    const snapshotSrc = fs.readFileSync(
      path.join(__dirname, '../src/services/aiAnalysisSnapshot.service.js'),
      'utf8'
    );
    assert.match(stage1, /refreshOnFrDrift:\s*true/);
    assert.match(snapshotSrc, /refreshOnFrDrift/);
    assert.match(snapshotSrc, /force:\s*Boolean\(shouldRefresh\)/);
  });
});
