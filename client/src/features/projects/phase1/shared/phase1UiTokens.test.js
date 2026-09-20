/**
 * Phase 1 UI token maps — status / kind / queue helpers.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  KIND_TONE,
  QUEUE_TONE,
  STATUS_TONE,
  gateStepClass,
  kindAccentCardClass,
  kindChipClass,
  priorityBadgeClass,
  queueCardClass,
  statusBadgeClass,
  statusRowTintClass,
} from './phase1UiTokens.js';

describe('phase1UiTokens', () => {
  it('maps every known status to a non-empty badge class', () => {
    for (const key of Object.keys(STATUS_TONE)) {
      const cls = statusBadgeClass(key);
      assert.ok(cls.includes('inline-flex'), key);
      assert.ok(cls.length > 20, key);
    }
  });

  it('falls back unknown status to draft tone', () => {
    const unknown = statusBadgeClass('not_a_real_status');
    const draft = statusBadgeClass('draft');
    assert.equal(unknown, draft);
    assert.equal(statusBadgeClass(null), draft);
    assert.equal(statusBadgeClass(''), draft);
  });

  it('maps every known kind to a chip class', () => {
    for (const key of Object.keys(KIND_TONE)) {
      const cls = kindChipClass(key);
      assert.ok(cls.includes('font-mono'), key);
      assert.ok(cls.includes('border'), key);
    }
    const fallback = kindChipClass('XYZ');
    assert.ok(fallback.includes('muted') || fallback.includes('border'));
  });

  it('normalizes kind case', () => {
    assert.equal(kindChipClass('fr'), kindChipClass('FR'));
  });

  it('maps queue stages', () => {
    for (const key of Object.keys(QUEUE_TONE)) {
      assert.ok(queueCardClass(key).includes('border'), key);
    }
    assert.ok(queueCardClass('unknown_stage').includes('border'));
  });

  it('priority and gate helpers return classes', () => {
    assert.ok(priorityBadgeClass('high').includes('rose') || priorityBadgeClass('high').includes('destructive'));
    assert.ok(priorityBadgeClass('weird').length > 10);
    assert.ok(gateStepClass('done').includes('emerald'));
    assert.ok(gateStepClass('pending').includes('amber'));
    assert.ok(gateStepClass('locked').includes('muted') || gateStepClass('locked').includes('border'));
  });

  it('kind accent cards differ for FR vs UC', () => {
    const fr = kindAccentCardClass('FR');
    const uc = kindAccentCardClass('UC');
    assert.notEqual(fr, uc);
    assert.ok(fr.includes('blue'));
    assert.ok(uc.includes('purple'));
  });

  it('status row tint returns string', () => {
    assert.equal(typeof statusRowTintClass('pending_review'), 'string');
    assert.equal(statusRowTintClass('nope'), '');
  });
});
