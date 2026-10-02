/**
 * BG Derive Input V2 — contract + budget smoke.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildBgDeriveInput,
  profileBgDeriveInput,
  slimFrForBg,
  selectFrForBg,
  BG_FR_SOFT_CAP,
} = require('../src/semantic/buildBgDeriveInput');
const { buildDerivePrompt } = require('../src/semantic/runRawSectionDerive');

describe('buildBgDeriveInput V2', () => {
  const pack = {
    overview: {
      requirementName: 'Attendance Hub',
      projectObjective: 'Manage employee attendance',
      businessScope: 'HR attendance recording',
      expectedUsers: 'Employee, Manager, HR',
    },
    functionalRequirements: Array.from({ length: 20 }, (_, i) => ({
      externalId: `FR-${String(i + 1).padStart(3, '0')}`,
      name: `Capability ${i + 1}`,
      description: 'x'.repeat(400),
      acceptanceCriteria: 'y'.repeat(200),
      moduleLabel: i < 5 ? 'Attendance' : i < 10 ? 'Leave' : 'Payroll',
      actor: i % 2 === 0 ? 'Employee' : 'Manager',
      requestId: i < 3 ? 'BRQ-001' : undefined,
    })),
    nonFunctionalRequirements: [
      { externalId: 'NFR-001', category: 'Perf', name: 'Response < 2s', target: '2s' },
    ],
    aiAnalysis: {
      customerRawRows: {
        businessRequests: [
          {
            requestId: 'BRQ-001',
            title: 'Attendance',
            businessGoal: 'Improve attendance management',
            stakeholder: 'HR',
            priority: 'High',
            customerStatement: 'z'.repeat(500),
          },
        ],
      },
    },
  };

  it('drops AC, description, NFR, evidence.value, full understanding', () => {
    const input = buildBgDeriveInput(pack, {
      g4Understanding: {
        semanticItems: [
          {
            frId: 'FR-001',
            semanticInterpretation: {
              capability: 'Attendance Recording',
              intent: 'Track check-in',
            },
          },
          {
            frId: 'FR-002',
            semanticInterpretation: {
              capability: 'Attendance Recording',
              intent: 'Correct records',
            },
          },
        ],
        evidence: [
          { id: 'E-001', frId: 'FR-001', value: 'SECRET_BODY_SHOULD_NOT_LEAK', metric: 'x' },
        ],
      },
    });

    assert.equal(input.mode, 'raw_derive_v2');
    assert.ok(input.requirements.length <= BG_FR_SOFT_CAP);
    assert.ok(input.requirements.every((r) => r.id && r.name && !('description' in r) && !('acceptanceCriteria' in r)));
    assert.equal(input.nonFunctionalRequirements, undefined);
    assert.equal(input.requirementUnderstanding, undefined);
    assert.equal(input.semanticItems, undefined);
    assert.ok(input.businessThemes.some((t) => t.name === 'Attendance Recording'));
    assert.deepEqual(input.evidenceRefs[0], { refId: 'E-001', frId: 'FR-001' });
    assert.ok(!JSON.stringify(input).includes('SECRET_BODY'));
    assert.ok(input.businessRequests[0].businessGoal.includes('attendance'));
  });

  it('FR selection prefers BRQ-linked then module reps', () => {
    const frAll = pack.functionalRequirements.map((row) => {
      const slim = slimFrForBg(row);
      slim._requestId = row.requestId || '';
      return slim;
    });
    const brq = [{ id: 'BRQ-001' }];
    const selected = selectFrForBg(frAll, brq);
    assert.ok(selected.some((r) => r.id === 'FR-001'));
    assert.ok(selected.some((r) => r.id === 'FR-002'));
    assert.ok(selected.some((r) => r.id === 'FR-003'));
    const modules = new Set(selected.map((r) => r.module));
    assert.ok(modules.has('Attendance'));
    assert.ok(modules.has('Leave') || modules.has('Payroll'));
    assert.ok(selected.length <= BG_FR_SOFT_CAP);
  });

  it('prompt stays under soft budget (~6k) for typical pack', () => {
    const input = buildBgDeriveInput(pack, {
      g4Understanding: {
        semanticItems: [
          {
            frId: 'FR-001',
            semanticInterpretation: { capability: 'Attendance', intent: 'Record' },
          },
        ],
      },
    });
    const prompt = buildDerivePrompt('bg', input, {
      promptPolicy: 'Return goals[]',
      semanticSchema: { goals: [] },
    });
    const profile = profileBgDeriveInput(input, prompt);
    assert.ok(profile.TOTAL.chars < 6000, `promptChars=${profile.TOTAL.chars}`);
    assert.ok(profile.fr.chars < 2500);
    assert.equal(profile.TOTAL.chars > 200, true);
  });
});
