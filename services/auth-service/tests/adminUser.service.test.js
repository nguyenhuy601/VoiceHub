const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const servicePath = path.resolve(__dirname, '../src/services/adminUser.service.js');
const userAuthPath = path.resolve(__dirname, '../src/models/UserAuth.js');
const loginEventPath = path.resolve(__dirname, '../src/models/AuthLoginEvent.js');
const tokenVersionPath = path.resolve(__dirname, '../src/utils/tokenVersion.js');
const emailServicePath = path.resolve(__dirname, '../src/utils/email.js');
const authEmailPiiPath = path.resolve(__dirname, '../src/utils/authEmailPii.js');

function clearServiceModules() {
  for (const p of [servicePath, userAuthPath, loginEventPath, tokenVersionPath, emailServicePath, authEmailPiiPath]) {
    delete require.cache[p];
  }
}

describe('adminUser.service', () => {
  let bumpCalls;
  let savedDocs;

  beforeEach(() => {
    bumpCalls = 0;
    savedDocs = [];
    clearServiceModules();

    require.cache[userAuthPath] = {
      exports: {
        findOne: async ({ userId }) => savedDocs.find((d) => d.userId === userId) || null,
        find: (query) => ({
          select: () => ({
            lean: async () =>
              savedDocs.filter((d) => (query.userId?.$in || []).includes(d.userId)),
          }),
        }),
      },
    };

    require.cache[loginEventPath] = {
      exports: {
        create: async (doc) => ({ ...doc, _id: 'evt1', createdAt: new Date() }),
        find: () => ({
          sort: () => ({
            skip: () => ({
              limit: () => ({
                lean: async () => [],
              }),
            }),
          }),
        }),
        countDocuments: async () => 0,
      },
    };

    require.cache[tokenVersionPath] = {
      exports: {
        bumpTokenVersion: async (doc) => {
          bumpCalls += 1;
          doc.tokenVersion = Number(doc.tokenVersion || 0) + 1;
          return doc.tokenVersion;
        },
      },
    };

    require.cache[emailServicePath] = {
      exports: {
        isAvailable: () => false,
        sendPasswordResetEmail: async () => false,
      },
    };

    require.cache[authEmailPiiPath] = {
      exports: {
        hydrateAuthEmailDoc: async (doc) => doc.email || null,
        readEmailFromStored: (stored) => String(stored || '').trim(),
        findUserAuthByEmail: async () => null,
      },
    };
  });

  afterEach(() => {
    clearServiceModules();
  });

  it('setUserLocked deactivates account and bumps token version', async () => {
    const doc = {
      userId: 'u-lock',
      isActive: true,
      loginAttempts: 3,
      lockUntil: new Date(Date.now() + 60000),
      save: async function save() {
        savedDocs = [this];
      },
    };
    savedDocs = [doc];

    const adminUserService = require(servicePath);
    const summary = await adminUserService.setUserLocked('u-lock', true);

    assert.equal(doc.isActive, false);
    assert.equal(doc.loginAttempts, 0);
    assert.equal(doc.lockUntil, null);
    assert.equal(bumpCalls, 1);
    assert.equal(summary.isActive, false);
  });

  it('setUserLocked unlock restores isActive without bump when unlocking', async () => {
    const doc = {
      userId: 'u-unlock',
      isActive: false,
      save: async function save() {
        savedDocs = [this];
      },
    };
    savedDocs = [doc];

    const adminUserService = require(servicePath);
    const summary = await adminUserService.setUserLocked('u-unlock', false);

    assert.equal(doc.isActive, true);
    assert.equal(bumpCalls, 1);
    assert.equal(summary.isActive, true);
  });

  it('setMustChangePassword bumps token version when enabling requirement', async () => {
    const doc = {
      userId: 'u-force',
      mustChangePassword: false,
      save: async function save() {
        savedDocs = [this];
      },
    };
    savedDocs = [doc];

    const adminUserService = require(servicePath);
    const summary = await adminUserService.setMustChangePassword('u-force', true);

    assert.equal(doc.mustChangePassword, true);
    assert.equal(bumpCalls, 1);
    assert.equal(summary.mustChangePassword, true);
  });

  it('triggerPasswordReset returns dev resetUrl when SMTP unavailable', async () => {
    const doc = {
      userId: 'u-reset',
      email: 'reset@example.com',
      save: async function save() {
        savedDocs = [this];
      },
    };
    savedDocs = [doc];
    process.env.NODE_ENV = 'development';

    const adminUserService = require(servicePath);
    const result = await adminUserService.triggerPasswordReset('u-reset', 'https://voicehub.local');

    assert.equal(result.emailScheduled, false);
    assert.match(result.resetUrl, /reset-password#token=/);
    assert.ok(doc.passwordResetToken);
    assert.ok(doc.passwordResetExpiresAt);
  });
});
