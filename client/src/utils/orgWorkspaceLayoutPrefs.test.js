import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  ORG_LEFT_RAIL_BASE_W,
  ORG_LEFT_RAIL_ICON_W,
  ORG_LEFT_RAIL_MAX_W,
  ORG_LEFT_RAIL_MIN_W,
  ORG_RIGHT_PANEL_BASE_W,
  ORG_RIGHT_PANEL_MAX_W,
  ORG_RIGHT_PANEL_MIN_W,
  isWideContentTab,
  loadOrgWorkspaceLayoutPrefs,
  saveOrgWorkspaceLayoutPrefs,
} from './orgWorkspaceLayoutPrefs.js';

const STORAGE_KEY = 'vh.orgWorkspace.layout.v1';

describe('orgWorkspaceLayoutPrefs', () => {
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

  it('defaults khi chưa có prefs', () => {
    const p = loadOrgWorkspaceLayoutPrefs();
    assert.equal(p.leftOpen, true);
    assert.equal(p.rightOpen, true);
    assert.equal(p.leftWidth, ORG_LEFT_RAIL_BASE_W);
    assert.equal(p.rightWidth, ORG_RIGHT_PANEL_BASE_W);
    assert.ok(ORG_LEFT_RAIL_ICON_W < ORG_LEFT_RAIL_MIN_W);
  });

  it('save + load persist open/width và clamp', () => {
    saveOrgWorkspaceLayoutPrefs({
      leftOpen: false,
      rightOpen: false,
      leftWidth: 9999,
      rightWidth: 50,
    });
    const p = loadOrgWorkspaceLayoutPrefs();
    assert.equal(p.leftOpen, false);
    assert.equal(p.rightOpen, false);
    assert.equal(p.leftWidth, ORG_LEFT_RAIL_MAX_W);
    assert.equal(p.rightWidth, ORG_RIGHT_PANEL_MIN_W);
    assert.ok(mem.has(STORAGE_KEY));
  });

  it('patch từng phần không ghi đè field khác', () => {
    saveOrgWorkspaceLayoutPrefs({ leftWidth: 300, rightOpen: false });
    saveOrgWorkspaceLayoutPrefs({ leftOpen: false });
    const p = loadOrgWorkspaceLayoutPrefs();
    assert.equal(p.leftOpen, false);
    assert.equal(p.rightOpen, false);
    assert.equal(p.leftWidth, 300);
  });

  it('isWideContentTab Docs/Lịch/Họp', () => {
    assert.equal(isWideContentTab('documents'), true);
    assert.equal(isWideContentTab('calendar'), true);
    assert.equal(isWideContentTab('meetings'), true);
    assert.equal(isWideContentTab('announcement'), false);
    assert.equal(isWideContentTab('members'), false);
    assert.equal(ORG_RIGHT_PANEL_MAX_W > ORG_RIGHT_PANEL_BASE_W, true);
  });
});
