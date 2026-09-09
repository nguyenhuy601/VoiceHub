import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import {
  SESSION_MARKER_COOKIE,
  hasSessionMarkerCookie,
  clearSessionMarkerCookie,
} from './sessionMarkerCookie.js';

describe('sessionMarkerCookie', () => {
  const saved = {};

  beforeEach(() => {
    saved.document = globalThis.document;
    saved.window = globalThis.window;
    let cookie = '';
    globalThis.document = {
      get cookie() {
        return cookie;
      },
      set cookie(value) {
        const part = String(value || '');
        if (part.includes('Max-Age=0')) {
          cookie = '';
          return;
        }
        cookie = part.split(';')[0];
      },
    };
    globalThis.window = { location: { protocol: 'https:' } };
  });

  afterEach(() => {
    if (saved.document === undefined) delete globalThis.document;
    else globalThis.document = saved.document;
    if (saved.window === undefined) delete globalThis.window;
    else globalThis.window = saved.window;
  });

  it('detects vh_has_session=1', () => {
    globalThis.document.cookie = `${SESSION_MARKER_COOKIE}=1`;
    assert.equal(hasSessionMarkerCookie(), true);
  });

  it('clearSessionMarkerCookie removes marker', () => {
    globalThis.document.cookie = `${SESSION_MARKER_COOKIE}=1`;
    clearSessionMarkerCookie();
    assert.equal(hasSessionMarkerCookie(), false);
  });
});
