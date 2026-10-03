/**
 * Step 1 — Raw derive policy + input builder.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  isCustomerRawIntakePack,
  hasRawDeriveSource,
  shouldRawDeriveSection,
  isRawSectionDeriveEnabled,
  LLM_DERIVE_SECTIONS,
} = require('../src/semantic/rawSectionDerivePolicy');
const { buildRawDeriveInput } = require('../src/semantic/buildRawDeriveInput');
const { extractArray } = require('../src/semantic/runRawSectionDerive');

describe('rawSectionDerivePolicy', () => {
  it('detects Customer Raw via formValidation.ok', () => {
    assert.equal(
      isCustomerRawIntakePack({
        aiAnalysis: { formValidation: { ok: true, recognizedAsCustomerRaw: true } },
      }),
      true
    );
  });

  it('detects Customer Raw via intakeKind', () => {
    assert.equal(
      isCustomerRawIntakePack({
        aiAnalysis: { workbookDiagnostic: { intakeKind: 'customer_raw' } },
      }),
      true
    );
  });

  it('detects Customer Raw via canonicalRaw (hydrate freeze)', () => {
    assert.equal(
      isCustomerRawIntakePack({
        functionalRequirements: [{ externalId: 'FR-1' }],
        aiAnalysis: {
          canonicalRaw: { registryVersion: 'raw-sem-v1', templateVersion: '1.1-raw' },
        },
      }),
      true
    );
  });

  it('freeze pack without aiAnalysis markers → false (derive would no-op)', () => {
    assert.equal(
      isCustomerRawIntakePack({
        functionalRequirements: [{ externalId: 'FR-1', name: 'A' }],
        nonFunctionalRequirements: [],
        overview: { projectObjective: 'x' },
      }),
      false
    );
  });

  it('Analysis pack without Raw signals → false', () => {
    assert.equal(
      isCustomerRawIntakePack({
        functionalRequirements: [{ externalId: 'FR-1' }],
        aiAnalysis: { formValidation: { ok: false } },
      }),
      false
    );
  });

  it('hasRawDeriveSource from FR or BRQ or overview', () => {
    assert.equal(hasRawDeriveSource({ functionalRequirements: [{ externalId: 'CR-1' }] }), true);
    assert.equal(
      hasRawDeriveSource({
        aiAnalysis: { customerRawRows: { businessRequests: [{ requestId: 'BRQ-1' }] } },
      }),
      true
    );
    assert.equal(hasRawDeriveSource({ overview: { projectObjective: 'Register courses' } }), true);
    assert.equal(hasRawDeriveSource({ functionalRequirements: [] }), false);
  });

  it('shouldRawDeriveSection requires Raw + source + kill-switch', () => {
    const pack = {
      functionalRequirements: [{ externalId: 'CR-001', name: 'Search' }],
      aiAnalysis: {
        formValidation: { ok: true, recognizedAsCustomerRaw: true },
        customerRawRows: { businessRequests: [{ requestId: 'BRQ-001', businessGoal: 'Online reg' }] },
      },
    };
    // Default active = BG only; UC locked unless PHASE1_RAW_DERIVE_SECTIONS unlocks
    assert.equal(shouldRawDeriveSection('bg', pack, { PHASE1_RAW_SECTION_DERIVE: '1' }), true);
    assert.equal(shouldRawDeriveSection('uc', pack, { PHASE1_RAW_SECTION_DERIVE: '1' }), false);
    assert.equal(
      shouldRawDeriveSection('uc', pack, {
        PHASE1_RAW_SECTION_DERIVE: '1',
        PHASE1_RAW_DERIVE_SECTIONS: 'uc,bg',
      }),
      true
    );
    assert.equal(shouldRawDeriveSection('bg', pack, { PHASE1_RAW_SECTION_DERIVE: '0' }), false);
    assert.equal(
      shouldRawDeriveSection('bg', { functionalRequirements: [{ externalId: 'FR-1' }] }, {}),
      false
    );
    assert.equal(shouldRawDeriveSection('fr', pack, {}), false);
    assert.ok(LLM_DERIVE_SECTIONS.includes('uc'));
  });

  it('locks LLM secs by default; BG + scope/actors/assumption deterministic active', () => {
    const pack = {
      functionalRequirements: [{ externalId: 'CR-001', name: 'Search' }],
      aiAnalysis: {
        formValidation: { ok: true, recognizedAsCustomerRaw: true },
        customerRawRows: { businessRequests: [{ requestId: 'BRQ-001' }] },
      },
    };
    const env = { PHASE1_RAW_SECTION_DERIVE: '1' };
    assert.equal(shouldRawDeriveSection('uc', pack, env), false);
    assert.equal(shouldRawDeriveSection('br', pack, env), false);
    assert.equal(shouldRawDeriveSection('bpm', pack, env), false);
    assert.equal(shouldRawDeriveSection('data', pack, env), false);
    assert.equal(shouldRawDeriveSection('interface', pack, env), false);
    assert.equal(shouldRawDeriveSection('actors', pack, env), true);
    assert.equal(shouldRawDeriveSection('assumption', pack, env), true);
    assert.equal(shouldRawDeriveSection('bg', pack, env), true);
    assert.equal(shouldRawDeriveSection('scope', pack, env), true);
    assert.equal(
      shouldRawDeriveSection('br', pack, { ...env, PHASE1_RAW_DERIVE_SECTIONS: 'uc,bg,br' }),
      true
    );
  });

  it('kill-switch defaults on', () => {
    assert.equal(isRawSectionDeriveEnabled({}), true);
    assert.equal(isRawSectionDeriveEnabled({ PHASE1_RAW_SECTION_DERIVE: '0' }), false);
  });
});

describe('buildRawDeriveInput', () => {
  const pack = {
    overview: {
      requirementName: 'Student Management',
      projectObjective: 'Manage students',
      expectedUsers: 'Admin, Student',
      integration: 'University SSO',
      constraint: 'Must use SSO',
    },
    scope: [{ type: 'in', description: 'Student profiles' }],
    functionalRequirements: [
      {
        externalId: 'CR-001',
        name: 'Admin can create a student profile',
        actor: 'Admin',
        moduleLabel: 'Student',
        acceptanceCriteria: 'Profile saved',
        requestId: 'BRQ-001',
      },
      {
        externalId: 'CR-002',
        name: 'Student can view schedule',
        actor: 'Student',
        moduleLabel: 'Schedule',
      },
    ],
    nonFunctionalRequirements: [{ externalId: 'NFR-001', category: 'Security', name: 'SSO login' }],
    aiAnalysis: {
      formValidation: { ok: true },
      customerRawRows: {
        businessRequests: [
          {
            requestId: 'BRQ-001',
            title: 'Online registration',
            businessGoal: 'Enable online course registration',
            expectedBenefit: 'Less paperwork',
          },
        ],
        references: [{ referenceId: 'REF-001', name: 'Workshop notes' }],
      },
    },
  };

  it('UC input V2: slim FR + overview (no legacy dump)', () => {
    const input = buildRawDeriveInput('uc', pack);
    assert.equal(input.mode, 'raw_derive_v2');
    assert.equal(input.focus, 'use_cases');
    assert.ok(input.frSlim.some((r) => r.id === 'CR-001' && r.actor === 'Admin'));
    assert.match(String(input.overview?.expectedUsers || ''), /Admin/);
    assert.ok(!('requirementUnderstanding' in input));
    assert.ok(!('functionalRequirements' in input));
  });

  it('UC V2 stays slim even when G4 understanding provided', () => {
    const input = buildRawDeriveInput('uc', pack, {
      g4Understanding: {
        requirements: [{ id: 'CR-001', title: 'Admin create student', actors: ['Admin'] }],
        semanticItems: [
          {
            frId: 'CR-001',
            semanticInterpretation: { capability: 'create_profile', intent: 'admin_creates' },
          },
        ],
        evidence: [{ id: 'EV-1', type: 'source_fr', frId: 'CR-001', source: 'llm_semantic' }],
        ambiguities: [],
        conflicts: [],
      },
    });
    assert.equal(input.mode, 'raw_derive_v2');
    assert.ok(input.frSlim.some((r) => r.id === 'CR-001'));
    assert.equal(input.requirementUnderstanding, undefined);
    assert.match(String(input.deriveInstruction), /use cases/i);
  });

  it('BG input V2: slim FR/BRQ, no AC/desc/NFR/understanding dump', () => {
    const input = buildRawDeriveInput('bg', pack, {
      g4Understanding: {
        semanticItems: [
          {
            frId: 'CR-001',
            semanticInterpretation: { capability: 'Student Profile', intent: 'Create profiles' },
          },
        ],
        evidence: [
          {
            id: 'E-1',
            frId: 'CR-001',
            value: 'LONG evidence body that must not appear in BG LLM input',
            metric: 'noise',
          },
        ],
      },
    });
    assert.equal(input.mode, 'raw_derive_v2');
    assert.equal(input.focus, 'business_goals');
    assert.equal(input.businessRequests[0].businessGoal, 'Enable online course registration');
    assert.ok(input.requirements.some((r) => r.id === 'CR-001' && r.actor === 'Admin'));
    const fr0 = input.requirements.find((r) => r.id === 'CR-001');
    assert.equal(fr0.description, undefined);
    assert.equal(fr0.acceptanceCriteria, undefined);
    assert.equal(input.requirementUnderstanding, undefined);
    assert.equal(input.nonFunctionalRequirements, undefined);
    assert.ok(input.businessThemes.length >= 1);
    assert.ok(input.evidenceRefs.some((e) => e.refId === 'E-1' && e.frId === 'CR-001'));
    assert.ok(!JSON.stringify(input.evidenceRefs).includes('LONG evidence'));
    assert.ok(input.sourceRefs['CR-001']?.includes('E-1'));
  });

  it('interface input V2 keeps platform/integration signals', () => {
    const input = buildRawDeriveInput('interface', pack);
    assert.equal(input.mode, 'raw_derive_v2');
    assert.equal(input.projectContext.integration, 'University SSO');
    assert.ok(input.integrationSignals?.length >= 1);
  });

  it('actors input exposes FR actors + targetUsers', () => {
    const input = buildRawDeriveInput('actors', pack);
    assert.equal(input.focus, 'actors');
    assert.ok(input.functionalRequirements.every((r) => 'actor' in r));
  });
});

describe('extractArray BG shapes', () => {
  it('accepts bare JSON array from small models', () => {
    const rows = extractArray('bg', [
      { goalId: 'BG-1', statement: 'A' },
      { goalId: 'BG-2', statement: 'B' },
    ]);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].goalId, 'BG-1');
  });

  it('accepts goals key and businessGoals alias', () => {
    assert.equal(extractArray('bg', { goals: [{ statement: 'G' }] }).length, 1);
    assert.equal(extractArray('bg', { businessGoals: [{ statement: 'G' }] }).length, 1);
  });
});
