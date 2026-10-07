const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  buildPollFromInput,
  assertVoteSelection,
  toPublicPoll,
} = require('../src/utils/pollPolicy');
const { isUserMessageTypeAllowed, ROOM_ONLY_USER_MESSAGE_TYPES } = require('../src/utils/chatErrorMap');
const { toClientMessage } = require('../src/utils/messageDto');

describe('pollPolicy', () => {
  it('build từ 2–6 đáp án, duration → closesAt, không nhận votes/closed', () => {
    const poll = buildPollFromInput({
      question: ' Ăn gì? ',
      options: ['Phở', 'Bún'],
      allowMulti: false,
      duration: '1h',
    });
    assert.equal(poll.question, 'Ăn gì?');
    assert.equal(poll.options.length, 2);
    assert.equal(poll.options[0].id, 'o1');
    assert.equal(poll.allowMulti, false);
    assert.equal(poll.closed, false);
    assert.equal(poll.votes.length, 0);
    assert.ok(new Date(poll.closesAt).getTime() > Date.now());

    assert.throws(
      () => buildPollFromInput({ question: 'Q', options: ['A'], duration: '1h' }),
      (err) => err.errorCode === 'CHAT_VALIDATION_ERROR'
    );
    assert.throws(
      () =>
        buildPollFromInput({
          question: 'Q',
          options: ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
          duration: '24h',
        }),
      (err) => err.errorCode === 'CHAT_VALIDATION_ERROR'
    );
    assert.throws(
      () =>
        buildPollFromInput({
          question: 'Q',
          options: ['A', 'B'],
          duration: '24h',
          votes: [{ userId: 'x', optionIds: ['o1'] }],
        }),
      (err) => err.errorCode === 'CHAT_VALIDATION_ERROR'
    );
    assert.throws(
      () =>
        buildPollFromInput({
          question: 'Q',
          options: ['A', 'B'],
          duration: 'nope',
        }),
      (err) => err.errorCode === 'CHAT_VALIDATION_ERROR'
    );
  });

  it('DM reject poll; room cho phép', () => {
    assert.ok(ROOM_ONLY_USER_MESSAGE_TYPES.includes('poll'));
    assert.equal(isUserMessageTypeAllowed('poll', { isRoom: false }), false);
    assert.equal(isUserMessageTypeAllowed('poll', { isRoom: true }), true);
  });

  it('vote single đã chọn / hết hạn / multi thay phiếu', () => {
    const poll = buildPollFromInput({
      question: 'Q',
      options: ['A', 'B', 'C'],
      allowMulti: false,
      duration: '24h',
    });
    assert.deepEqual(assertVoteSelection(poll, ['o1'], 'u1'), ['o1']);
    poll.votes.push({ userId: 'u1', optionIds: ['o1'] });
    assert.throws(
      () => assertVoteSelection(poll, ['o2'], 'u1'),
      (err) => err.errorCode === 'CHAT_POLL_ALREADY_VOTED'
    );

    const expired = { ...poll, votes: [], closesAt: new Date(Date.now() - 1000), closed: false };
    assert.throws(
      () => assertVoteSelection(expired, ['o1'], 'u2'),
      (err) => err.errorCode === 'CHAT_POLL_EXPIRED'
    );

    const closed = { ...poll, votes: [], closed: true, closesAt: new Date(Date.now() + 60_000) };
    assert.throws(
      () => assertVoteSelection(closed, ['o1'], 'u2'),
      (err) => err.errorCode === 'CHAT_POLL_CLOSED'
    );

    const multi = buildPollFromInput({
      question: 'Q',
      options: ['A', 'B'],
      allowMultiAnswer: true,
      duration: '6h',
    });
    multi.votes.push({ userId: 'u1', optionIds: ['o1'] });
    assert.deepEqual(assertVoteSelection(multi, ['o1', 'o2'], 'u1'), ['o1', 'o2']);
  });

  it('DTO chỉ counts + viewerVote, không lộ userId phiếu', () => {
    const poll = {
      question: 'Q',
      options: [
        { id: 'o1', text: 'A' },
        { id: 'o2', text: 'B' },
      ],
      allowMulti: false,
      closesAt: new Date(Date.now() + 60_000),
      closed: false,
      votes: [
        { userId: 'user-secret', optionIds: ['o1'] },
        { userId: 'other', optionIds: ['o2'] },
      ],
    };
    const pub = toPublicPoll(poll, 'user-secret');
    assert.equal(pub.options[0].count, 1);
    assert.equal(pub.options[1].count, 1);
    assert.deepEqual(pub.viewerVoteOptionIds, ['o1']);
    assert.equal(JSON.stringify(pub).includes('user-secret'), false);

    const dto = toClientMessage({
      _id: 'm1',
      senderId: 's1',
      content: 'Q',
      messageType: 'poll',
      poll,
    }, { viewerId: 'other' });
    assert.deepEqual(dto.poll.viewerVoteOptionIds, ['o2']);
    assert.equal(JSON.stringify(dto).includes('user-secret'), false);
    assert.equal(dto.poll.votes, undefined);
  });
});

describe('poll vote route contract', () => {
  it('POST votes dùng voteWriteLimiter và emit room:poll_updated', () => {
    const routes = fs.readFileSync(
      path.join(__dirname, '../src/routes/message.routes.js'),
      'utf8'
    );
    const controller = fs.readFileSync(
      path.join(__dirname, '../src/controllers/message.controller.js'),
      'utf8'
    );
    assert.match(routes, /'\/:messageId\/votes',\s*\n\s*voteWriteLimiter/s);
    assert.match(controller, /event: 'room:poll_updated'/);
    assert.match(controller, /viewerVoteOptionIds: \[\]/);
    assert.match(controller, /buildPollFromInput\(poll\)/);
  });
});
