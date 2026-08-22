/**
 * Pure duration helpers — mirror client projectHubUtils applySprintDuration / getSprintDurationDays
 * so node:test can run without Vite.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const SPRINT_DURATION_DAYS = Object.freeze({
  '1w': 7,
  '2w': 14,
  '3w': 21,
  '4w': 28,
  custom: null,
});

function getSprintDurationDays(duration) {
  const key = String(duration || '').trim();
  if (!Object.prototype.hasOwnProperty.call(SPRINT_DURATION_DAYS, key)) return null;
  return SPRINT_DURATION_DAYS[key];
}

function toDateTimeLocalValue(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function addDaysToDateTimeLocal(startValue, days) {
  const d = startValue ? new Date(startValue) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + Number(days || 0));
  return toDateTimeLocalValue(d);
}

function applySprintDuration(duration, startDateTimeLocal, currentEndDateTimeLocal = '') {
  const next = String(duration || 'custom').trim() || 'custom';
  const days = getSprintDurationDays(next);
  if (days == null) {
    return { duration: 'custom', endDate: currentEndDateTimeLocal || '' };
  }
  const base = startDateTimeLocal || toDateTimeLocalValue(new Date());
  return { duration: next, endDate: addDaysToDateTimeLocal(base, days) };
}

describe('applySprintDuration', () => {
  const start = '2026-08-21T10:34';

  it('1w → +7 days', () => {
    const r = applySprintDuration('1w', start, 'keep');
    assert.equal(r.duration, '1w');
    assert.equal(r.endDate, '2026-08-28T10:34');
  });

  it('2w → +14 days', () => {
    const r = applySprintDuration('2w', start, '');
    assert.equal(r.endDate, '2026-09-04T10:34');
  });

  it('3w → +21 days', () => {
    const r = applySprintDuration('3w', start, '');
    assert.equal(r.endDate, '2026-09-11T10:34');
  });

  it('4w → +28 days', () => {
    const r = applySprintDuration('4w', start, '');
    assert.equal(r.endDate, '2026-09-18T10:34');
  });

  it('custom keeps current end', () => {
    const r = applySprintDuration('custom', start, '2026-10-01T12:00');
    assert.equal(r.duration, 'custom');
    assert.equal(r.endDate, '2026-10-01T12:00');
  });
});
