const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  resolveNotificationScope,
  isObjectIdString,
  buildScopedUserFilter,
  buildPersonalScopeFilter,
  buildOrganizationScopeFilter,
} = require('../src/utils/notificationScopePolicy');
const { toClientNotification } = require('../src/utils/notificationDto');

const VALID_ORG = '507f1f77bcf86cd799439011';

describe('notificationScopePolicy', () => {
  it('omit scope defaults to personal', () => {
    const r = resolveNotificationScope({}, { defaultScope: 'personal' });
    assert.equal(r.ok, true);
    assert.equal(r.scope, 'personal');
    assert.equal(r.organizationId, '');
  });

  it('organization without orgId → NOTIFICATION_ORG_REQUIRED', () => {
    const r = resolveNotificationScope({ scope: 'organization' });
    assert.equal(r.ok, false);
    assert.equal(r.errorCode, 'NOTIFICATION_ORG_REQUIRED');
    assert.equal(r.status, 400);
  });

  it('organization with bad ObjectId → VALIDATION', () => {
    const r = resolveNotificationScope({
      scope: 'organization',
      organizationId: 'not-an-id',
    });
    assert.equal(r.ok, false);
    assert.equal(r.errorCode, 'NOTIFICATION_VALIDATION_ERROR');
  });

  it('organization with valid ObjectId ok', () => {
    const r = resolveNotificationScope({
      scope: 'organization',
      organizationId: VALID_ORG,
    });
    assert.equal(r.ok, true);
    assert.equal(r.scope, 'organization');
    assert.equal(r.organizationId, VALID_ORG);
  });

  it('isObjectIdString', () => {
    assert.equal(isObjectIdString(VALID_ORG), true);
    assert.equal(isObjectIdString('xyz'), false);
  });

  it('buildScopedUserFilter personal vs organization', () => {
    const personal = buildScopedUserFilter('u1', 'personal');
    assert.equal(personal.userId, 'u1');
    assert.ok(personal.$and);
    assert.deepEqual(personal.$and, buildPersonalScopeFilter().$and);

    const org = buildScopedUserFilter('u1', 'organization', VALID_ORG);
    assert.equal(org.userId, 'u1');
    assert.deepEqual(org.$or, buildOrganizationScopeFilter(VALID_ORG).$or);
  });
});

describe('toClientNotification fields=summary', () => {
  const doc = {
    _id: 'n1',
    type: 'system',
    title: 'Hello',
    content: 'World',
    isRead: false,
    createdAt: '2026-09-30T00:00:00.000Z',
    updatedAt: '2026-09-30T00:00:00.000Z',
    data: {
      kind: 'x',
      organizationId: 'o1',
      secretNested: { password: 'nope' },
      channelId: 'c1',
    },
    actionUrl: '/app',
    toObject() {
      return { ...this };
    },
  };

  it('summary whitelists data keys and drops extras', () => {
    const out = toClientNotification(doc, { fields: 'summary' });
    assert.deepEqual(out.data, {
      kind: 'x',
      organizationId: 'o1',
      channelId: 'c1',
    });
    assert.equal(out.data.secretNested, undefined);
  });

  it('default keeps full data', () => {
    const out = toClientNotification(doc);
    assert.equal(out.data.secretNested.password, 'nope');
  });
});

describe('notificationScope source-contract', () => {
  it('internalNotificationAuth uses compareGatewayToken', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../src/middlewares/internalNotificationAuth.js'),
      'utf8'
    );
    assert.ok(src.includes('compareGatewayToken'));
    assert.ok(src.includes('NOTIFICATION_INTERNAL_AUTH_UNCONFIGURED'));
    assert.equal(src.includes('got !== expected'), false);
  });

  it('service markAllAsRead/deleteAllRead accept scope options', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../src/services/notification.service.js'),
      'utf8'
    );
    assert.ok(src.includes('async markAllAsRead(userId, { scope'));
    assert.ok(src.includes('async deleteAllRead(userId, { scope'));
    assert.ok(src.includes("event: 'notification:read_all'"));
    assert.ok(src.includes('scope: normalizedScope'));
  });

  it('controller resolves membership for organization scope', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../src/controllers/notification.controller.js'),
      'utf8'
    );
    assert.ok(src.includes('assertActiveOrgMembership'));
    assert.ok(src.includes('NOTIFICATION_ORG_FORBIDDEN'));
    assert.ok(src.includes('pickScopeRaw'));
  });
});
