/**
 * Regression: Bugbot findings — DM cache + pageToken pagination
 * node tests/bugbot-dm-pagination-fixes.smoke.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

const verify = fs.readFileSync(
  path.join(root, 'services/chat-service/src/utils/verifyDmRelationship.js'),
  'utf8'
);
assert.ok(
  verify.includes("cached.status !== 'accepted'"),
  'DM cache must not short-circuit on cached accepted'
);
assert.ok(
  verify.includes("rel.status === 'accepted') return"),
  'DM cache must not store accepted status'
);

for (const rel of [
  'client/src/hooks/queries/useOrgChannelMessages.js',
  'client/src/hooks/queries/useDmConversation.js',
]) {
  const src = fs.readFileSync(path.join(root, rel), 'utf8');
  assert.ok(!src.includes('currentPage + 1'), `${rel} must not use legacy page numbers in getNextPageParam`);
  assert.ok(src.includes('nextPageToken'), `${rel} must use nextPageToken only`);
}

const socketCtx = fs.readFileSync(
  path.join(root, 'client/src/context/SocketContext.jsx'),
  'utf8'
);
assert.ok(socketCtx.includes('accessToken'), 'SocketContext must reconnect when accessToken changes');

console.log('bugbot-dm-pagination-fixes.smoke.js: OK');
