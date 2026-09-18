import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolvePlanningBarRange,
  unionPlanningBounds,
  barStyleInWindow,
} from './planningGanttUtils.js';

describe('planningGanttUtils', () => {
  it('resolves schedule range', () => {
    const r = resolvePlanningBarRange({
      kind: 'SCHEDULE',
      structured: { startDate: '2026-10-01', endDate: '2026-10-10' },
    });
    assert.ok(r);
    assert.equal(r.isMilestone, false);
  });

  it('resolves milestone as diamond day', () => {
    const r = resolvePlanningBarRange({
      kind: 'MILESTONE',
      structured: { targetDate: '2026-11-01' },
    });
    assert.ok(r);
    assert.equal(r.isMilestone, true);
  });

  it('builds bar style', () => {
    const window = {
      start: new Date('2026-10-01T00:00:00'),
      end: new Date('2026-10-31T00:00:00'),
    };
    const range = {
      start: new Date('2026-10-05T00:00:00'),
      end: new Date('2026-10-12T00:00:00'),
      isMilestone: false,
    };
    const s = barStyleInWindow(range, window, 300);
    assert.ok(s.left);
    assert.ok(s.width);
  });

  it('unions bounds', () => {
    const b = unionPlanningBounds([
      { kind: 'WBS', structured: { startDate: '2026-10-01', endDate: '2026-10-05' } },
    ]);
    assert.ok(b.start <= new Date('2026-10-01'));
  });
});
