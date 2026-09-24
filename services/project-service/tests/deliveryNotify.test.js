const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  KIND,
  readyToDoneDedupeAction,
  releaseReadyDedupeAction,
  readyForQaDedupeAction,
  shouldNotifyUatRequested,
} = require('../src/utils/work/deliveryNotify');
const {
  isReadyForQaList,
  isReadyForQaListTitle,
} = require('../src/services/boardCapabilities');

describe('deliveryNotify pure', () => {
  it('exports kind constants including ready_for_qa', () => {
    assert.equal(KIND.READY_TO_DONE, 'ready_to_done_proposed');
    assert.equal(KIND.RELEASE_READY, 'release_ready_proposed');
    assert.equal(KIND.UAT_REQUESTED, 'uat_requested');
    assert.equal(KIND.READY_FOR_QA, 'ready_for_qa');
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

  it('readyForQa: notify once on enter; clear on leave', () => {
    assert.equal(
      readyForQaDedupeAction({ isInReadyForQa: true, notifiedAt: null }),
      'notify'
    );
    assert.equal(
      readyForQaDedupeAction({ isInReadyForQa: true, notifiedAt: new Date() }),
      'skip'
    );
    assert.equal(
      readyForQaDedupeAction({ isInReadyForQa: false, notifiedAt: new Date() }),
      'clear'
    );
    assert.equal(
      readyForQaDedupeAction({ isInReadyForQa: false, notifiedAt: null }),
      'skip'
    );
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

describe('isReadyForQaList', () => {
  it('matches title and statusKey qa', () => {
    assert.equal(isReadyForQaListTitle('Ready for QA'), true);
    assert.equal(isReadyForQaList({ title: 'Ready for QA' }), true);
    assert.equal(isReadyForQaList({ statusKey: 'qa', title: 'QA Queue' }), true);
    assert.equal(isReadyForQaList({ title: 'In Progress' }), false);
    assert.equal(isReadyForQaList({ statusKey: 'todo', title: 'To Do' }), false);
  });
});
