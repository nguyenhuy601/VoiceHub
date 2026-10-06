import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveHowPlanSummary } from './howPlanSummary.js';

describe('resolveHowPlanSummary', () => {
  it('reads planning.planSummary when present', () => {
    const s = resolveHowPlanSummary({
      aiAnalysis: {
        planning: {
          planSummary: {
            criticalPathDays: 12,
            conflictCount: 2,
            unassignedCount: 1,
            criticalFloatRows: [{ taskId: 'T1', totalFloat: 0, name: 'A' }],
            deadlineConflict: {
              deadline: '2026-06-01',
              estimatedEnd: '2026-06-15',
              daysOver: 14,
              needsPmReview: true,
            },
          },
        },
      },
    });
    assert.equal(s.hasSummary, true);
    assert.equal(s.criticalPathDays, 12);
    assert.equal(s.conflictCount, 2);
    assert.equal(s.unassignedCount, 1);
    assert.equal(s.criticalFloatRows.length, 1);
    assert.equal(s.deadlineConflict?.deadline, '2026-06-01');
    assert.equal(s.deadlineConflict?.daysOver, 14);
  });

  it('returns empty-safe when no plan data (HARD-03 no invent)', () => {
    const s = resolveHowPlanSummary({});
    assert.equal(s.hasSummary, false);
    assert.equal(s.conflictCount, 0);
    assert.equal(s.criticalFloatRows.length, 0);
    assert.equal(s.deadlineConflict, null);
  });

  it('fallback past_deadline from capacityConflicts', () => {
    const s = resolveHowPlanSummary({
      aiAnalysis: {
        resource: {
          capacityConflicts: [
            {
              type: 'past_deadline',
              deadline: '2026-05-01',
              estimatedEnd: '2026-05-20',
            },
          ],
        },
      },
    });
    assert.equal(s.hasSummary, true);
    assert.equal(s.deadlineConflict?.deadline, '2026-05-01');
    assert.equal(s.deadlineConflict?.estimatedEnd, '2026-05-20');
    assert.equal(s.deadlineConflict?.needsPmReview, true);
  });
});