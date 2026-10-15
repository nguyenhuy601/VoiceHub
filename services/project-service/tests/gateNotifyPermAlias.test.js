/**
 * Gate notify: requirement:* must alias to matrix permissions (else 0 recipients).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveGateNotifyPermission,
  GATE_NOTIFY_PERM_ALIASES,
} = require('../src/utils/phase1GatePolicy');

describe('resolveGateNotifyPermission', () => {
  it('aliases requirement:* to BA/PO/PM matrix keys', () => {
    assert.equal(
      resolveGateNotifyPermission('requirement:submit'),
      'analysis:submit_ba_review'
    );
    assert.equal(resolveGateNotifyPermission('requirement:approve'), 'analysis:po_review');
    assert.equal(
      resolveGateNotifyPermission('requirement:run-ai-planning'),
      'planning:pm_review'
    );
  });

  it('passes through matrix permissions unchanged', () => {
    assert.equal(
      resolveGateNotifyPermission('analysis:submit_ba_review'),
      'analysis:submit_ba_review'
    );
    assert.equal(resolveGateNotifyPermission('planning:pm_review'), 'planning:pm_review');
    assert.equal(resolveGateNotifyPermission('planning:po_review'), 'planning:po_review');
  });

  it('returns empty for blank', () => {
    assert.equal(resolveGateNotifyPermission(''), '');
    assert.equal(resolveGateNotifyPermission(null), '');
  });

  it('exports stable alias map', () => {
    assert.ok(GATE_NOTIFY_PERM_ALIASES['requirement:submit']);
    assert.ok(GATE_NOTIFY_PERM_ALIASES['requirement:approve']);
    assert.ok(GATE_NOTIFY_PERM_ALIASES['requirement:run-ai-planning']);
  });
});
