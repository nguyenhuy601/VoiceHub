const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeEstimateHours,
  normalizeWorklogHours,
  normalizeWorkDate,
  varianceHours,
  sumWorklogHours,
} = require('../src/utils/timeTracking');
const fs = require('fs');
const path = require('path');

describe('estimateHours validate', () => {
  it('accepts >= 0', () => {
    assert.equal(normalizeEstimateHours(8), 8);
    assert.equal(normalizeEstimateHours(0), 0);
    assert.equal(normalizeEstimateHours(null), null);
  });

  it('rejects negative', () => {
    assert.throws(() => normalizeEstimateHours(-1), /estimateHours/);
  });
});

describe('worklog hours / date (W1 helpers)', () => {
  it('normalizes hours in range', () => {
    assert.equal(normalizeWorklogHours(3), 3);
    assert.equal(normalizeWorklogHours(0.25), 0.25);
  });

  it('rejects out of range', () => {
    assert.throws(() => normalizeWorklogHours(0.1));
    assert.throws(() => normalizeWorklogHours(25));
  });

  it('normalizes workDate to UTC day', () => {
    const d = normalizeWorkDate('2026-08-06');
    assert.equal(d.toISOString().slice(0, 10), '2026-08-06');
  });
});

describe('sum / variance (W2 W3)', () => {
  it('sums worklog hours for sprint fixture', () => {
    assert.equal(sumWorklogHours([{ hours: 3 }, { hours: 2 }, { hours: 1.5 }]), 6.5);
  });

  it('estimate 8 vs actual 5 → variance -3', () => {
    const v = varianceHours(8, sumWorklogHours([{ hours: 3 }, { hours: 2 }]));
    assert.equal(v.estimateHours, 8);
    assert.equal(v.actualHours, 5);
    assert.equal(v.varianceHours, -3);
  });
});

describe('W4 — worklog service does not write ProjectMember', () => {
  it('source has no ProjectMember import/write', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../src/services/worklog.service.js'),
      'utf8'
    );
    assert.equal(src.includes("require('../models/ProjectMember')"), false);
    assert.equal(src.includes('ProjectMember.'), false);
  });
});

describe('W7 — permission gates on worklog/estimate paths', () => {
  it('create/list worklog require task:update / task:view', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../src/services/worklog.service.js'),
      'utf8'
    );
    assert.match(src, /permission:\s*'task:update'/);
    assert.match(src, /permission:\s*'task:view'/);
    assert.match(src, /assertUserProjectPermission/);
  });

  it('task update whitelist includes estimateHours', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../src/services/task.service.js'),
      'utf8'
    );
    assert.match(src, /'estimateHours'/);
    assert.match(src, /estimate_updated/);
  });
});
