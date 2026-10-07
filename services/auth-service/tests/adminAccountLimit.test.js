const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { createAdminAccountLimiter } = require('../src/middleware/sensitiveAuthLimiter');

const WRITE_ACTIONS = [
  'lock',
  'force-password',
  'reset-password',
  'revoke-sessions',
  'set-password',
  'activate',
  'resend-verification',
];
const READ_ACTIONS = ['summary', 'login-events'];

function routeWindow(src, action) {
  const marker = `/:userId/${action}\``;
  const idx = src.indexOf(marker);
  assert.ok(idx > 0, `missing route ${action}`);
  const next = src.indexOf('router.', idx + marker.length);
  return src.slice(idx, next === -1 ? src.length : next);
}

describe('admin account limiter mount', () => {
  const src = fs.readFileSync(path.join(__dirname, '../src/routes/auth.routes.js'), 'utf8');

  it('mounts one shared limiter after fullAuth on the seven account writes', () => {
    assert.equal(src.split('createAdminAccountLimiter()').length - 1, 1);
    for (const action of WRITE_ACTIONS) {
      assert.match(routeWindow(src, action), /\.\.\.fullAuth,\s*adminAccountLimiter/);
    }
  });

  it('leaves summary and login-events on hrAuth only', () => {
    for (const action of READ_ACTIONS) {
      const window = routeWindow(src, action);
      assert.match(window, /\.\.\.hrAuth/);
      assert.equal(window.includes('adminAccountLimiter'), false);
    }
  });
});

describe('createAdminAccountLimiter', () => {
  it('429s the third hit for one actor, shares the bucket across routes, and isolates another actor', async () => {
    const app = express();
    const limiter = createAdminAccountLimiter({
      AUTH_ADMIN_ACCOUNT_RATE_MAX: '2',
      AUTH_ADMIN_ACCOUNT_RATE_WINDOW_MS: '60000',
    });
    let hits = 0;
    const asActor = (req, _res, next) => {
      req.user = { id: String(req.get('x-test-actor') || '') };
      next();
    };
    const ok = (_req, res) => {
      hits += 1;
      res.json({ ok: true });
    };
    app.post('/lock', asActor, limiter, ok);
    app.post('/set-password', asActor, limiter, ok);

    const server = await new Promise((resolve) => {
      const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const hit = (pathname, actor) =>
      fetch(`${base}${pathname}`, { method: 'POST', headers: { 'x-test-actor': actor } });

    try {
      assert.equal((await hit('/lock', 'admin-a')).status, 200);
      assert.equal((await hit('/set-password', 'admin-a')).status, 200);
      const limited = await hit('/lock', 'admin-a');
      assert.equal(limited.status, 429);
      const body = await limited.json();
      const blob = JSON.stringify(body);
      assert.equal(body.errorCode, 'AUTH_RATE_LIMITED');
      assert.equal(/password|resetUrl|token/i.test(blob), false);
      assert.equal(hits, 2);
      assert.equal((await hit('/lock', 'admin-b')).status, 200);
      assert.equal(hits, 3);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
