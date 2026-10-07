const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  resolveJoinedRoom,
  resolveTrustedVoiceUserId,
  assertFeatureAllowed,
  createJoinRateLimiter,
  VOICE_ROOM_MISMATCH,
  VOICE_ROOM_REQUIRED,
  VOICE_FEATURE_FORBIDDEN,
  VOICE_RATE_LIMITED,
} = require('../src/utils/voiceSocketRoomGuard');

function socketIn(roomId) {
  return { data: { voiceRoomId: roomId } };
}

describe('voiceSocketRoomGuard', () => {
  it('thiếu join → VOICE_ROOM_REQUIRED; room lệch → MISMATCH; trống thì dùng phòng đã join', () => {
    assert.throws(
      () => resolveJoinedRoom({ data: {} }, 'room-b'),
      (err) => err.errorCode === VOICE_ROOM_REQUIRED
    );
    assert.throws(
      () => resolveJoinedRoom(socketIn('room-a'), 'room-b'),
      (err) => err.errorCode === VOICE_ROOM_MISMATCH
    );
    assert.equal(resolveJoinedRoom(socketIn('room-a'), 'room-a'), 'room-a');
    assert.equal(resolveJoinedRoom(socketIn('room-a'), ''), 'room-a');
    assert.equal(resolveJoinedRoom(socketIn('room-a')), 'room-a');
  });

  it('userId không lấy từ socket.id', () => {
    assert.equal(resolveTrustedVoiceUserId({ id: 'u1' }), 'u1');
    assert.equal(resolveTrustedVoiceUserId({ userId: 'u2' }), 'u2');
    assert.equal(resolveTrustedVoiceUserId({}), null);
    assert.equal(resolveTrustedVoiceUserId(null), null);
  });

  it('feature stop/disable từ chối khi không được phép', () => {
    assert.throws(
      () => assertFeatureAllowed(false),
      (err) => err.errorCode === VOICE_FEATURE_FORBIDDEN && err.statusCode === 403
    );
    assert.doesNotThrow(() => assertFeatureAllowed(true));
  });

  it('join vượt ngưỡng → VOICE_RATE_LIMITED, không gọi tiếp', () => {
    let clock = 1_000;
    const assertJoinRate = createJoinRateLimiter({ max: 2, windowMs: 10_000, now: () => clock });
    assertJoinRate('u1');
    assertJoinRate('u1');
    assert.throws(
      () => assertJoinRate('u1'),
      (err) => err.errorCode === VOICE_RATE_LIMITED && err.statusCode === 429
    );
    assertJoinRate('u2');
    clock += 10_001;
    assert.doesNotThrow(() => assertJoinRate('u1'));
  });
});

describe('voice namespace room contract', () => {
  it('produce và recording stop đi qua guard trước roomManager / stop segment', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../src/socket/voice.namespace.js'),
      'utf8'
    );
    assert.match(src, /resolveTrustedVoiceUserId\(authUser\)/);
    assert.doesNotMatch(src, /\|\|\s*socket\.id/);
    const produceAt = src.indexOf("socket.on('voice:produce'");
    const produceBlock = src.slice(produceAt, produceAt + 700);
    assert.match(produceBlock, /resolveJoinedRoom\(socket/);
    const produceGuard = produceBlock.indexOf('resolveJoinedRoom');
    const produceCall = produceBlock.indexOf('roomManager.produce');
    assert.ok(produceGuard >= 0 && produceCall > produceGuard);

    const stopAt = src.indexOf("socket.on('voice:recording:stop'");
    const stopBlock = src.slice(stopAt, stopAt + 900);
    assert.match(stopBlock, /resolveJoinedRoom\(socket/);
    assert.match(stopBlock, /assertFeatureAllowed\(/);
    const stopGuard = stopBlock.indexOf('resolveJoinedRoom');
    const stopFeature = stopBlock.indexOf('assertFeatureAllowed');
    const stopCall = stopBlock.indexOf('stopUserSegment');
    assert.ok(stopGuard >= 0 && stopFeature > stopGuard && stopCall > stopFeature);

    const disableAt = src.indexOf("socket.on('voice:aiSummary:disable'");
    const disableBlock = src.slice(disableAt, disableAt + 800);
    assert.match(disableBlock, /assertFeatureAllowed\(/);
    assert.ok(disableBlock.indexOf('assertFeatureAllowed') < disableBlock.indexOf('disableRoomSummary'));
  });
});
