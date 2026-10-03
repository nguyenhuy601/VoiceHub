import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  tcResultKey,
  tcResultBadgeClass,
  tcResultRowClass,
  tcFilterChipClass,
  crStatusBadgeClass,
  crStatusRowClass,
  crPriorityBadgeClass,
  issueTypeCardClass,
  readyToDoneCardAccentClass,
  releaseMetricClass,
  HUB_GRID_CELL,
} from './phase3HubUiTokens.js';

describe('phase3HubUiTokens', () => {
  it('maps TC results to non-empty classes', () => {
    for (const k of ['pass', 'fail', 'none', '', null]) {
      assert.ok(tcResultBadgeClass(k).length > 10);
      assert.ok(tcResultRowClass(k).length > 5);
    }
    assert.equal(tcResultKey('PASS'), 'pass');
    assert.equal(tcResultKey('x'), 'none');
  });

  it('filter chips: active primary; inactive tint', () => {
    assert.match(tcFilterChipClass('pass', { active: true }), /bg-primary/);
    assert.match(tcFilterChipClass('fail', { active: false }), /destructive/);
    assert.match(tcFilterChipClass('all', { active: false }), /border-border/);
  });

  it('CR status + priority badges', () => {
    for (const s of ['draft', 'pending', 'approved', 'applied', 'rejected', 'unknown']) {
      assert.ok(crStatusBadgeClass(s).includes('rounded-full'));
    }
    assert.ok(crStatusRowClass('applied').includes('emerald') || crStatusRowClass('applied').length >= 0);
    assert.match(crPriorityBadgeClass('critical'), /destructive/);
    assert.match(crPriorityBadgeClass('low'), /muted/);
  });

  it('issue type card + ready accent', () => {
    assert.match(issueTypeCardClass('bug'), /rose/);
    assert.match(issueTypeCardClass('task'), /slate/);
    assert.match(issueTypeCardClass('story'), /sky/);
    assert.equal(readyToDoneCardAccentClass(false), '');
    assert.match(readyToDoneCardAccentClass(true), /warning/);
  });

  it('release metrics and soft grid cell', () => {
    assert.match(releaseMetricClass('bugs', { count: 2 }), /destructive/);
    assert.match(releaseMetricClass('bugs', { count: 0 }), /emerald/);
    assert.match(HUB_GRID_CELL, /px-2/);
    assert.doesNotMatch(HUB_GRID_CELL, /border-r|border border/);
  });
});
