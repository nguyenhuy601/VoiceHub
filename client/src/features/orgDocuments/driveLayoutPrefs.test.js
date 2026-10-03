import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  DRIVE_PREVIEW_BASE_W,
  DRIVE_PREVIEW_MIN_W,
  DRIVE_RAIL_BASE_W,
  DRIVE_RAIL_MAX_W,
  loadDriveRailPrefs,
  saveDriveRailPrefs,
} from './driveLayoutPrefs.js';

const STORAGE_KEY = 'vh.orgWorkspace.driveRail.v1';

describe('driveLayoutPrefs', () => {
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

  it('defaults: rail + preview mở, width chuẩn', () => {
    const p = loadDriveRailPrefs();
    assert.equal(p.leftOpen, true);
    assert.equal(p.previewOpen, true);
    assert.equal(p.leftWidth, DRIVE_RAIL_BASE_W);
    assert.equal(p.previewWidth, DRIVE_PREVIEW_BASE_W);
    assert.equal(p.viewMode, 'list');
  });

  it('persist + clamp width', () => {
    saveDriveRailPrefs({
      leftOpen: false,
      previewOpen: false,
      leftWidth: 9999,
      previewWidth: 10,
      viewMode: 'grid',
    });
    const p = loadDriveRailPrefs();
    assert.equal(p.leftOpen, false);
    assert.equal(p.previewOpen, false);
    assert.equal(p.leftWidth, DRIVE_RAIL_MAX_W);
    assert.equal(p.previewWidth, DRIVE_PREVIEW_MIN_W);
    assert.equal(p.viewMode, 'grid');
    assert.ok(mem.has(STORAGE_KEY));
  });

  it('patch từng phần không ghi đè field khác', () => {
    saveDriveRailPrefs({ leftWidth: 300, previewOpen: false, viewMode: 'grid' });
    saveDriveRailPrefs({ leftOpen: false });
    const p = loadDriveRailPrefs();
    assert.equal(p.leftOpen, false);
    assert.equal(p.previewOpen, false);
    assert.equal(p.leftWidth, 300);
    assert.equal(p.previewWidth, DRIVE_PREVIEW_BASE_W);
    assert.equal(p.viewMode, 'grid');
  });

  it('viewMode lạ → list', () => {
    saveDriveRailPrefs({ viewMode: 'weird' });
    assert.equal(loadDriveRailPrefs().viewMode, 'list');
  });
});
