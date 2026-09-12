import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  DM_INFO_BASE_W,
  DM_INFO_MAX_W,
  DM_INFO_MIN_W,
  DM_LIST_BASE_W,
  DM_LIST_MAX_W,
  DM_LIST_MIN_W,
  getDmChatLayoutDefaults,
  getDmChatLayoutStorageKey,
  loadDmChatLayoutPrefs,
  saveDmChatLayoutPrefs,
} from './dmChatLayoutPrefs.js';

const STORAGE_KEY = 'vh.dmChat.layout.v2';
const LEGACY_KEY = 'vh.dmChat.layout.v1';

describe('dmChatLayoutPrefs', () => {
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

  it('defaults: rightOpen false, key v2', () => {
    const p = loadDmChatLayoutPrefs();
    assert.equal(getDmChatLayoutStorageKey(), STORAGE_KEY);
    assert.equal(p.leftOpen, true);
    assert.equal(p.rightOpen, false);
    assert.equal(p.leftWidth, DM_LIST_BASE_W);
    assert.equal(p.rightWidth, DM_INFO_BASE_W);
    assert.deepEqual(getDmChatLayoutDefaults(), {
      leftOpen: true,
      rightOpen: false,
      leftWidth: DM_LIST_BASE_W,
      rightWidth: DM_INFO_BASE_W,
    });
  });

  it('D4: migrate v1 rightOpen true → v2 rightOpen false, giữ width', () => {
    mem.set(
      LEGACY_KEY,
      JSON.stringify({ leftOpen: true, rightOpen: true, leftWidth: 300, rightWidth: 360 })
    );
    const p = loadDmChatLayoutPrefs();
    assert.equal(p.rightOpen, false);
    assert.equal(p.leftWidth, 300);
    assert.equal(p.rightWidth, 360);
    assert.ok(mem.has(STORAGE_KEY));
    const stored = JSON.parse(mem.get(STORAGE_KEY));
    assert.equal(stored.rightOpen, false);
  });

  it('v2 đã lưu rightOpen true → hydrate vẫn false (không sticky RHS)', () => {
    mem.set(
      STORAGE_KEY,
      JSON.stringify({ leftOpen: true, rightOpen: true, leftWidth: 260, rightWidth: 320 })
    );
    const p = loadDmChatLayoutPrefs();
    assert.equal(p.rightOpen, false);
  });

  it('save rightOpen true trong phiên nhưng LS luôn false', () => {
    const session = saveDmChatLayoutPrefs({ rightOpen: true, leftWidth: 280 });
    assert.equal(session.rightOpen, true);
    assert.equal(session.leftWidth, 280);
    const stored = JSON.parse(mem.get(STORAGE_KEY));
    assert.equal(stored.rightOpen, false);
    assert.equal(loadDmChatLayoutPrefs().rightOpen, false);
  });

  it('save chỉ width không ép trả rightOpen true từ LS cũ', () => {
    mem.set(
      STORAGE_KEY,
      JSON.stringify({ leftOpen: true, rightOpen: true, leftWidth: 260, rightWidth: 320 })
    );
    const session = saveDmChatLayoutPrefs({ leftWidth: 300 });
    assert.equal(session.rightOpen, false);
    assert.equal(session.leftWidth, 300);
  });

  it('save + load persist và clamp', () => {
    saveDmChatLayoutPrefs({
      leftOpen: false,
      rightOpen: false,
      leftWidth: 9999,
      rightWidth: 50,
    });
    const p = loadDmChatLayoutPrefs();
    assert.equal(p.leftOpen, false);
    assert.equal(p.rightOpen, false);
    assert.equal(p.leftWidth, DM_LIST_MAX_W);
    assert.equal(p.rightWidth, DM_INFO_MIN_W);
    assert.ok(mem.has(STORAGE_KEY));
    assert.ok(DM_LIST_MAX_W >= DM_LIST_MIN_W);
    assert.ok(DM_INFO_MAX_W >= DM_INFO_BASE_W);
  });

  it('patch từng phần không ghi đè field khác', () => {
    saveDmChatLayoutPrefs({ leftWidth: 300, rightOpen: true });
    saveDmChatLayoutPrefs({ leftOpen: false });
    const p = loadDmChatLayoutPrefs();
    assert.equal(p.leftOpen, false);
    assert.equal(p.rightOpen, false);
    assert.equal(p.leftWidth, 300);
    assert.equal(p.rightWidth, DM_INFO_BASE_W);
  });
});
