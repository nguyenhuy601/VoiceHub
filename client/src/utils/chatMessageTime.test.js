import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatChatClockTime,
  formatChatDateDividerLabel,
  messageDayKey,
  shouldShowChatDayDivider,
} from './chatMessageTime.js';

describe('chatMessageTime', () => {
  it('formatChatClockTime 24h', () => {
    assert.equal(formatChatClockTime('2026-08-24T10:42:00+07:00'), '10:42');
    assert.equal(formatChatClockTime('2026-08-24T03:05:00+07:00'), '03:05');
  });

  it('formatChatDateDividerLabel Zalo-style', () => {
    // 2026-08-24 là Thứ 2
    assert.equal(formatChatDateDividerLabel('2026-08-24T10:00:00+07:00', 'vi'), 'T2 24/08/2026');
    assert.equal(formatChatDateDividerLabel('2026-08-24T10:00:00+07:00', 'en'), 'Mon 24/08/2026');
  });

  it('shouldShowChatDayDivider', () => {
    assert.equal(shouldShowChatDayDivider('2026-08-24T10:00:00Z', null), true);
    assert.equal(
      shouldShowChatDayDivider('2026-08-24T18:00:00+07:00', '2026-08-24T08:00:00+07:00'),
      false
    );
    assert.equal(
      shouldShowChatDayDivider('2026-08-25T08:00:00+07:00', '2026-08-24T22:00:00+07:00'),
      true
    );
    assert.equal(messageDayKey('2026-08-24T23:59:00+07:00'), '2026-08-24');
  });
});
