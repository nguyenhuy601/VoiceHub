import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  VOICE_SIDE_BASE_W,
  VOICE_SIDE_MAX_W,
  VOICE_SIDE_MIN_W,
  getVoiceRoomLayoutDefaults,
  loadVoiceRoomLayoutPrefs,
  saveVoiceRoomLayoutPrefs,
} from './voiceRoomLayoutPrefs.js';

const STORAGE_KEY = 'vh.voiceRoom.layout.v1';

describe('voiceRoomLayoutPrefs', () => {
  const mem = new Map();

  beforeEach(() => {
    mem.clear();
    globalThis.localStorage = {
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => {
        mem.set(k, String(v));
      },
      removeItem: (k) => {
        mem.delete(k);
      },
    };
  });

  afterEach(() => {
    delete globalThis.localStorage;
  });

  it('defaults width 280 và lastPanel null', () => {
    const p = loadVoiceRoomLayoutPrefs();
    assert.equal(p.sidePanelWidth, VOICE_SIDE_BASE_W);
    assert.equal(p.lastPanel, null);
    assert.deepEqual(getVoiceRoomLayoutDefaults(), {
      sidePanelWidth: VOICE_SIDE_BASE_W,
      lastPanel: null,
    });
  });

  it('save + load clamp width và normalize lastPanel', () => {
    saveVoiceRoomLayoutPrefs({
      sidePanelWidth: 9999,
      lastPanel: 'chat',
    });
    let p = loadVoiceRoomLayoutPrefs();
    assert.equal(p.sidePanelWidth, VOICE_SIDE_MAX_W);
    assert.equal(p.lastPanel, 'chat');

    saveVoiceRoomLayoutPrefs({ sidePanelWidth: 10, lastPanel: 'nope' });
    p = loadVoiceRoomLayoutPrefs();
    assert.equal(p.sidePanelWidth, VOICE_SIDE_MIN_W);
    assert.equal(p.lastPanel, null);
    assert.ok(mem.has(STORAGE_KEY));
  });

  it('patch từng phần không ghi đè field khác', () => {
    saveVoiceRoomLayoutPrefs({ sidePanelWidth: 300, lastPanel: 'people' });
    saveVoiceRoomLayoutPrefs({ lastPanel: null });
    const p = loadVoiceRoomLayoutPrefs();
    assert.equal(p.sidePanelWidth, 300);
    assert.equal(p.lastPanel, null);
  });
});
