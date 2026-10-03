/**
 * Gate1 proposal items — actors must show even when legacy (no sectionReviews entry).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildGate1ProposalItems } from './buildGate1ProposalItems.js';

describe('buildGate1ProposalItems actors', () => {
  it('shows actors items when sectionReviews omit legacy actors', () => {
    const proposal = {
      generated: {
        functionalRequirements: {
          items: [{ logicalId: 'CR-001', title: 'Create employee', status: 'EXTRACTED' }],
        },
        actors: {
          items: [
            { logicalId: 'ACT-1', title: 'HR Admin', status: 'PROPOSED' },
            { logicalId: 'ACT-2', title: 'Nhân viên', status: 'PROPOSED' },
          ],
        },
        assumptions: {
          items: [{ logicalId: 'ASM-1', title: 'SSO ready', status: 'PROPOSED' }],
        },
      },
      completeness: {
        sectionReviews: [
          {
            section: 'functionalRequirements',
            status: 'REVIEW_REQUIRED',
            reviewable: true,
            coverage: { status: 'AVAILABLE' },
          },
          {
            section: 'assumptions',
            status: 'REVIEW_REQUIRED',
            reviewable: true,
            coverage: { status: 'AVAILABLE' },
          },
        ],
        softGaps: [],
      },
    };

    const out = buildGate1ProposalItems({ proposal });
    const actorSec = out.sections.find((s) => s.key === 'actors');
    assert.ok(actorSec, 'actors tab exists');
    assert.equal(actorSec.count, 2);
    assert.equal(actorSec.missing, false);
    assert.equal((out.bySection.actors || []).length, 2);
  });
});
