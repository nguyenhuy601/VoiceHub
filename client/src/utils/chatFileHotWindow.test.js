import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_FILE_HOT_DISPLAY_DAYS,
  getFileHotDisplayDays,
  isHotChatFile,
  partitionHotChatFiles,
} from './chatFileHotWindow.js';

describe('getFileHotDisplayDays', () => {
  it('mặc định 90', () => {
    assert.equal(getFileHotDisplayDays(''), DEFAULT_FILE_HOT_DISPLAY_DAYS);
    assert.equal(getFileHotDisplayDays(undefined), DEFAULT_FILE_HOT_DISPLAY_DAYS);
  });

  it('0 = hiện tất cả (rollback)', () => {
    assert.equal(getFileHotDisplayDays('0'), 0);
  });

  it('parse số hợp lệ', () => {
    assert.equal(getFileHotDisplayDays('30'), 30);
    assert.equal(getFileHotDisplayDays('180'), 180);
  });
});

describe('isHotChatFile / partitionHotChatFiles', () => {
  const now = new Date('2026-08-02T12:00:00.000Z');

  it('file trong 90 ngày là hot', () => {
    assert.equal(
      isHotChatFile({ at: '2026-07-01T00:00:00.000Z' }, { now, hotDays: 90 }),
      true
    );
  });

  it('file ngoài 90 ngày là archive (soft-hide)', () => {
    assert.equal(
      isHotChatFile({ createdAt: '2026-01-01T00:00:00.000Z' }, { now, hotDays: 90 }),
      false
    );
  });

  it('hotDays=0 không ẩn', () => {
    assert.equal(
      isHotChatFile({ at: '2020-01-01T00:00:00.000Z' }, { now, hotDays: 0 }),
      true
    );
  });

  it('partition đếm archived', () => {
    const { hot, archivedCount } = partitionHotChatFiles(
      [
        { id: '1', at: '2026-07-20T00:00:00.000Z' },
        { id: '2', at: '2025-01-01T00:00:00.000Z' },
        { id: '3', createdAt: '2026-06-01T00:00:00.000Z' },
      ],
      { now, hotDays: 90 }
    );
    assert.equal(hot.length, 2);
    assert.equal(archivedCount, 1);
    assert.deepEqual(
      hot.map((f) => f.id),
      ['1', '3']
    );
  });
});
