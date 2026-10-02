import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createNetworkController, NETWORK_STATE } from './networkController.js';
import { waitWhileOffline } from './waitWhileOffline.js';

describe('networkController', () => {
  it('starts ONLINE when getOnline true', () => {
    const c = createNetworkController({ getOnline: () => true });
    assert.equal(c.getState(), NETWORK_STATE.ONLINE);
    assert.equal(c.shouldBlockRequests(), false);
  });

  it('starts OFFLINE when getOnline false', () => {
    const c = createNetworkController({ getOnline: () => false });
    assert.equal(c.getState(), NETWORK_STATE.OFFLINE);
    assert.equal(c.shouldBlockRequests(), true);
    assert.equal(c.shouldPausePolling(), true);
  });

  it('transitions OFFLINE → RECONNECTING → ONLINE', () => {
    const states = [];
    const c = createNetworkController({ getOnline: () => true });
    c.subscribe((s) => states.push(s));
    c.markOffline();
    assert.equal(c.getState(), NETWORK_STATE.OFFLINE);
    c.markReconnecting();
    assert.equal(c.getState(), NETWORK_STATE.RECONNECTING);
    c.reportSuccess();
    assert.equal(c.getState(), NETWORK_STATE.ONLINE);
    assert.deepEqual(states, [
      NETWORK_STATE.OFFLINE,
      NETWORK_STATE.RECONNECTING,
      NETWORK_STATE.ONLINE,
    ]);
  });

  it('forces OFFLINE after fail burst', () => {
    const c = createNetworkController({
      getOnline: () => true,
      failBurstThreshold: 3,
      failBurstWindowMs: 60_000,
    });
    c.reportTransportFailure();
    c.reportTransportFailure();
    assert.equal(c.getState(), NETWORK_STATE.ONLINE);
    c.reportTransportFailure();
    assert.equal(c.getState(), NETWORK_STATE.OFFLINE);
  });

  it('notifies subscribers', () => {
    const c = createNetworkController({ getOnline: () => true });
    let seen = null;
    const unsub = c.subscribe((s) => {
      seen = s;
    });
    c.markOffline();
    assert.equal(seen, NETWORK_STATE.OFFLINE);
    unsub();
    c.markOnline();
    assert.equal(seen, NETWORK_STATE.OFFLINE);
  });
});

describe('waitWhileOffline', () => {
  it('resolves immediately when online', async () => {
    const c = createNetworkController({ getOnline: () => true });
    await waitWhileOffline({ controller: c });
    assert.equal(c.getState(), NETWORK_STATE.ONLINE);
  });

  it('waits until leaving OFFLINE', async () => {
    const c = createNetworkController({ getOnline: () => true });
    c.markOffline();
    let done = false;
    const p = waitWhileOffline({ controller: c }).then(() => {
      done = true;
    });
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(done, false);
    c.markReconnecting();
    await p;
    assert.equal(done, true);
  });
});
