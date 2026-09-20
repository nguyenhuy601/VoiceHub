const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  KIND,
  readyToDoneDedupeAction,
  releaseReadyDedupeAction,
  shouldNotifyUatRequested,
} = require('../src/utils/work/deliveryNotify');

describe('deliveryNotify pure', () => {
  it('exports three kind constants', () => {
    assert.equal(KIND.READY_TO_DONE, 'ready_to_done_proposed');
    assert.equal(KIND.RELEASE_READY, 'release_ready_proposed');
    assert.equal(KIND.UAT_REQUESTED, 'uat_requested');
  });

  it('readyToDone: notify once then skip until clear', () => {
    assert.equal(readyToDoneDedupeAction({ isReady: true, notifiedAt: null }), 'notify');
    assert.equal(
      readyToDoneDedupeAction({ isReady: true, notifiedAt: new Date() }),
      'skip'
    );
    assert.equal(
      readyToDoneDedupeAction({ isReady: false, notifiedAt: new Date() }),
      'clear'
    );
    assert.equal(readyToDoneDedupeAction({ isReady: false, notifiedAt: null }), 'skip');
  });

  it('releaseReady: no notify when already confirmed', () => {
    assert.equal(
      releaseReadyDedupeAction({
        isReady: true,
        releaseReadyStatus: 'confirmed',
        notifiedAt: null,
      }),
      'skip'
    );
    assert.equal(
      releaseReadyDedupeAction({
        isReady: true,
        releaseReadyStatus: 'confirmed',
        notifiedAt: new Date(),
      }),
      'clear'
    );
    assert.equal(
      releaseReadyDedupeAction({
        isReady: true,
        releaseReadyStatus: 'none',
        notifiedAt: null,
      }),
      'notify'
    );
    assert.equal(
      releaseReadyDedupeAction({
        isReady: false,
        releaseReadyStatus: 'none',
        notifiedAt: new Date(),
      }),
      'clear'
    );
  });

  it('uat: skip when already pass', () => {
    assert.equal(shouldNotifyUatRequested({ uatStatus: 'none' }), true);
    assert.equal(shouldNotifyUatRequested({ uatStatus: 'fail' }), true);
    assert.equal(shouldNotifyUatRequested({ uatStatus: 'pass' }), false);
  });
});
