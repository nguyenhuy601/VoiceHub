import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAiHitlReviewMode } from './aiHitlReviewMode.js';

describe('resolveAiHitlReviewMode', () => {
  it('legacy waiting_human data_review is idle (Data Gate HITL removed)', () => {
    assert.equal(
      resolveAiHitlReviewMode(
        { status: 'draft', aiAnalysis: { phaseRuns: { phase_what: { status: 'pending' } } } },
        { status: 'waiting_human', gate: 'data_review' }
      ),
      'idle'
    );
  });

  it('idle while WHAT pending even if old srsProposal exists', () => {
    assert.equal(
      resolveAiHitlReviewMode(
        {
          status: 'draft',
          aiAnalysis: {
            phaseRuns: { phase_what: { status: 'pending' } },
            analyses: { srsProposal: { generated: {} } },
          },
        },
        { status: 'running' }
      ),
      'idle'
    );
  });

  it('gate1 when what ready with proposal', () => {
    assert.equal(
      resolveAiHitlReviewMode(
        {
          status: 'under_review',
          aiAnalysis: {
            phaseRuns: { phase_what: { status: 'ready' } },
            analyses: { srsProposal: { generated: {} } },
          },
        },
        null
      ),
      'gate1'
    );
  });
});
