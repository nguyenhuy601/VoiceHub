/* eslint-disable no-console */
const assert = require('assert');
const { validateFriendSendPayload } = require('../services/socket-service/src/utils/socketEventValidation');

const validId = '507f1f77bcf86cd799439011';

assert.strictEqual(
  validateFriendSendPayload({
    receiverId: validId,
    content: 'hello',
    messageType: 'text',
  }).ok,
  true
);

assert.strictEqual(
  validateFriendSendPayload({ receiverId: 'bad', content: 'x' }).ok,
  false
);

assert.strictEqual(
  validateFriendSendPayload({ receiverId: validId, content: '' }).ok,
  false
);

assert.strictEqual(
  validateFriendSendPayload({
    receiverId: validId,
    content: 'x',
    messageType: 'evil',
  }).ok,
  false
);

console.log('socket-event-validation.smoke.js: OK');
