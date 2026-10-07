const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { rejectClientRoomSend } = require('../src/utils/roomSendPolicy');
const { resolveSocketAuthHeader } = require('../src/utils/socketAuthHeader');
const {
  compareGatewayToken,
} = require('../../../shared/middleware/compareGatewayToken');

describe('rejectClientRoomSend', () => {
  it('luôn reject client room:send', () => {
    const d = rejectClientRoomSend();
    assert.equal(d.rejected, true);
    assert.equal(d.code, 'ROOM_SEND_DISABLED');
  });
});

describe('resolveSocketAuthHeader', () => {
  it('ưu tiên handshake headers Authorization', () => {
    const h = resolveSocketAuthHeader({
      handshake: { headers: { authorization: 'Bearer hdr' }, auth: { token: 'authTok' } },
    });
    assert.equal(h, 'Bearer hdr');
  });

  it('fallback handshake.auth.token với prefix Bearer', () => {
    const h = resolveSocketAuthHeader({
      handshake: { headers: {}, auth: { token: 'rawTok' } },
    });
    assert.equal(h, 'Bearer rawTok');
  });
});

describe('socket-service source-contract', () => {
  it('server dùng compareGatewayToken cho realtime publish', () => {
    const src = fs.readFileSync(path.join(__dirname, '../src/server.js'), 'utf8');
    assert.ok(src.includes('compareGatewayToken'));
    assert.equal(src.includes('function tokensMatch'), false);
    assert.ok(compareGatewayToken('abc', 'abc'));
    assert.equal(compareGatewayToken('abc', 'xyz'), false);
  });

  it('chat.namespace reject room:send và rate-limit room:join', () => {
    const src = fs.readFileSync(path.join(__dirname, '../src/socket/chat.namespace.js'), 'utf8');
    assert.ok(src.includes('rejectClientRoomSend'));
    assert.ok(src.includes("emitRateLimited(socket, userId, 'room:join'"));
    assert.ok(src.includes('resolveSocketAuthHeader'));
    assert.equal(src.includes('emitToRoom(roomId, event'), false);
  });

  it('orgRoomAccess đọc canRead không dùng allowed (canVoice)', () => {
    const src = fs.readFileSync(path.join(__dirname, '../src/utils/orgRoomAccess.js'), 'utf8');
    assert.ok(src.includes('canRead'));
    assert.ok(src.includes('/internal/voice-channel-access/'));
    assert.equal(src.includes('data?.allowed'), false);
  });
});
