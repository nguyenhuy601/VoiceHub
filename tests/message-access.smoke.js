/* eslint-disable no-console */
const assert = require('assert');
const {
  assertCanAccessMessage,
  assertCanMarkMessageAsRead,
  resolveParticipantId,
} = require('../services/chat-service/src/utils/messageAccess');

async function run() {
  assert.strictEqual(resolveParticipantId({ _id: 'abc' }), 'abc');
  assert.strictEqual(resolveParticipantId('xyz'), 'xyz');

  await assertCanAccessMessage(
    { senderId: 'userA', receiverId: 'userB' },
    'userA',
    {}
  );
  await assertCanAccessMessage(
    { senderId: 'userA', receiverId: 'userB' },
    'userB',
    {}
  );

  await assert.rejects(
    () => assertCanAccessMessage({ senderId: 'userA', receiverId: 'userB' }, 'userC', {}),
    (err) => err.statusCode === 403
  );

  assertCanMarkMessageAsRead({ receiverId: 'userB' }, 'userB');

  assert.throws(
    () => assertCanMarkMessageAsRead({ receiverId: 'userB' }, 'userA'),
    (err) => err.statusCode === 403
  );

  assert.throws(
    () => assertCanMarkMessageAsRead({ roomId: 'room1' }, 'userA'),
    (err) => err.statusCode === 403
  );

  console.log('PASS message-access smoke');
}

run().catch((err) => {
  console.error('FAIL message-access smoke:', err.message);
  process.exit(1);
});
