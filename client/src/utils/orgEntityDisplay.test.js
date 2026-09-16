import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveChannelHeaderDescription } from './orgEntityDisplay.js';

describe('resolveChannelHeaderDescription', () => {
  it('bỏ mô tả seed EN, dùng fallback i18n', () => {
    assert.equal(
      resolveChannelHeaderDescription(
        { description: 'Departmental text chat' },
        'Kênh chat chung phòng ban'
      ),
      'Kênh chat chung phòng ban'
    );
    assert.equal(
      resolveChannelHeaderDescription(
        { description: 'Departmental voice channel' },
        'Voice phòng ban'
      ),
      'Voice phòng ban'
    );
  });

  it('giữ mô tả người dùng tự đặt', () => {
    assert.equal(
      resolveChannelHeaderDescription({ description: 'Standup 9h mỗi sáng' }, 'fallback'),
      'Standup 9h mỗi sáng'
    );
  });
});
