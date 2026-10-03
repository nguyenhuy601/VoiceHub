import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  attachConflictAmbiguityToGate1Bundle,
  resolveConflictAmbiguityFromPack,
} from './resolveConflictAmbiguityUi.js';

describe('resolveConflictAmbiguityUi Integrity R1', () => {
  it('reads requirementIntegrityGate with data_integrity', () => {
    const pack = {
      aiAnalysis: {
        phaseRuns: {
          phase_what: {
            requirementIntegrityGate: {
              passed: false,
              blocking: [
                {
                  blockKind: 'data_integrity',
                  kind: 'incomplete_fields',
                  requirementId: 'CR-001',
                  missing: ['Description', 'Priority'],
                  message: 'Missing required fields',
                },
              ],
              warnings: [],
            },
          },
        },
      },
    };
    const gate = resolveConflictAmbiguityFromPack(pack);
    assert.equal(gate.passed, false);
    assert.equal(gate.blocking[0].blockKind, 'data_integrity');
    assert.deepEqual(gate.blocking[0].missing, ['Description', 'Priority']);
  });

  it('B2: warnings-only does not fail gate for UI', () => {
    const pack = {
      aiAnalysis: {
        analyses: {
          g4Understanding: {
            conflictAmbiguityGate: {
              passed: false,
              blocking: [],
              warnings: [{ code: 'REL_EVIDENCE_REQUIRED', severity: 'warn' }],
            },
          },
        },
      },
    };
    const gate = resolveConflictAmbiguityFromPack(pack);
    assert.equal(gate.passed, true);
    assert.equal(gate.blocking.length, 0);
  });

  it('annotates matching FR rows as Missing fields integrity', () => {
    const pack = {
      aiAnalysis: {
        phaseRuns: {
          phase_what: {
            conflictAmbiguityGate: {
              passed: false,
              blocking: [
                {
                  blockKind: 'ambiguity',
                  kind: 'incomplete_fields',
                  requirementId: 'CR-002',
                  missing: ['Acceptance criteria'],
                },
              ],
            },
          },
        },
      },
    };
    const bundle = {
      bySection: {
        functionalRequirements: [
          { logicalId: 'CR-001', section: 'functionalRequirements', title: 'A' },
          { logicalId: 'CR-002', section: 'functionalRequirements', title: 'B' },
        ],
      },
      sections: [
        { key: 'functionalRequirements', label: 'FR', count: 2, missing: false },
      ],
      items: [
        { logicalId: 'CR-001', section: 'functionalRequirements' },
        { logicalId: 'CR-002', section: 'functionalRequirements' },
      ],
    };
    const out = attachConflictAmbiguityToGate1Bundle(bundle, pack);
    assert.equal(out.conflictAmbiguity.passed, false);
    assert.equal(out.bySection.functionalRequirements[0].logicalId, 'CR-002');
    assert.equal(out.bySection.functionalRequirements[0].integrityKind, 'data_integrity');
    assert.equal(out.sections[0].hasConflict, true);
  });
});
