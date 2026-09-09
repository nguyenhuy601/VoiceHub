import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  spreadCardHours,
  placeVirtualWorkBlocks,
  CALENDAR_WORKDAY_START_HOUR,
} from './calendarWorkSpread.js';

describe('calendarWorkSpread', () => {
  it('spreads evenly across weekdays Mon–Fri', () => {
    const map = spreadCardHours({
      estimateHours: 10,
      startDate: '2026-09-07', // Mon
      dueDate: '2026-09-11', // Fri
    });
    assert.equal(Object.keys(map).length, 5);
    assert.equal(map['2026-09-07'], 2);
    assert.equal(map['2026-09-11'], 2);
    assert.equal(map['2026-09-12'], undefined); // Sat
  });

  it('weekend-only window dumps hours on startDate', () => {
    const map = spreadCardHours({
      estimateHours: 3,
      startDate: '2026-09-12', // Sat
      dueDate: '2026-09-13', // Sun
    });
    assert.deepEqual(map, { '2026-09-12': 3 });
  });

  it('hours 0 or missing returns empty', () => {
    assert.deepEqual(spreadCardHours({ estimateHours: 0, dueDate: '2026-09-07' }), {});
    assert.deepEqual(spreadCardHours({ dueDate: '2026-09-07' }), {});
  });

  it('placeVirtualWorkBlocks stacks from 09:00', () => {
    const placed = placeVirtualWorkBlocks(
      [
        { id: 'a', hours: 2, title: 'A' },
        { id: 'b', hours: 1, title: 'B' },
      ],
      '2026-09-08'
    );
    assert.equal(placed.length, 2);
    assert.equal(placed[0].startAt.getHours(), CALENDAR_WORKDAY_START_HOUR);
    assert.equal(placed[0].startAt.getMinutes(), 0);
    assert.equal(placed[1].startAt.getHours(), 11);
  });
});
