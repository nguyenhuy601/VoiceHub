const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const routesSrc = fs.readFileSync(path.join(__dirname, '../src/routes/auth.routes.js'), 'utf8');
const serviceSrc = fs.readFileSync(path.join(__dirname, '../src/services/auth.service.js'), 'utf8');
const controllerSrc = fs.readFileSync(path.join(__dirname, '../src/controllers/auth.controller.js'), 'utf8');

function routeLine(marker) {
  return routesSrc.split('\n').find((line) => line.includes(marker)) || '';
}

describe('credential recovery residual', () => {
  it('mounts sensitiveAuthLimiter before change-password, email-change request, and verify-email-change handlers', () => {
    const changePassword = routeLine("'/change-password'");
    const emailRequest = routeLine("'/change-email/request'");
    const verifyChange = routeLine("'/verify-email-change'");

    assert.match(changePassword, /sensitiveAuthLimiter,\s*authController\.changePassword/);
    assert.match(emailRequest, /sensitiveAuthLimiter,\s*authController\.requestEmailChange/);
    assert.match(verifyChange, /sensitiveAuthLimiter,\s*authController\.verifyEmailChange/);

    assert.ok(changePassword.indexOf('authenticate') < changePassword.indexOf('sensitiveAuthLimiter'));
    assert.ok(emailRequest.indexOf('authenticate') < emailRequest.indexOf('sensitiveAuthLimiter'));
  });

  it('requestEmailChange does not assign verificationToken or verificationUrl', () => {
    const start = serviceSrc.indexOf('async requestEmailChange');
    const end = serviceSrc.indexOf('async verifyEmailChange');
    const body = serviceSrc.slice(start, end);
    assert.equal(body.includes('verificationToken'), false);
    assert.equal(body.includes('verificationUrl'), false);
    assert.match(body, /tokenLength:\s*token\.length/);
  });

  it('requestEmailChange controller data does not spread token fields', () => {
    const start = controllerSrc.indexOf('async requestEmailChange');
    const end = controllerSrc.indexOf('async verifyEmailChange');
    const body = controllerSrc.slice(start, end);
    assert.equal(body.includes('verificationToken'), false);
    assert.equal(body.includes('verificationUrl'), false);
    assert.match(body, /emailScheduled:\s*!!result\.emailScheduled/);
  });
});
