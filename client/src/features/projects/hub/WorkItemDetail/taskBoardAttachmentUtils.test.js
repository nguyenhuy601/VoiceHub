import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isStorageObjectPath,
  resolveStoragePathFromAttachment,
} from '../../board/taskBoardAttachmentUtils.js';

test('isStorageObjectPath nhận temp/tasks prefix', () => {
  assert.equal(isStorageObjectPath('temp/u1/file.pdf'), true);
  assert.equal(isStorageObjectPath('https://example.com/a.pdf'), false);
  assert.equal(isStorageObjectPath('/app/collaborate/projects/temp/u1/a.md'), false);
});

test('resolveStoragePathFromAttachment ưu tiên storagePath', () => {
  assert.equal(
    resolveStoragePathFromAttachment({
      name: 'demo.md',
      storagePath: 'temp/u1/x_demo.md',
      url: 'https://voicehub.local/wrong',
    }),
    'temp/u1/x_demo.md'
  );
  assert.equal(
    resolveStoragePathFromAttachment({ name: 'old', url: 'temp/u1/legacy.md' }),
    'temp/u1/legacy.md'
  );
});

import {
  resolveAttachmentContentType,
  shouldOpenAttachmentInline,
} from '../../board/taskBoardAttachmentDisplay.js';

test('resolveAttachmentContentType cho markdown', () => {
  assert.equal(
    resolveAttachmentContentType({ name: 'demo.md' }, 'temp/u1/x_demo.md'),
    'text/plain; charset=utf-8'
  );
  assert.equal(shouldOpenAttachmentInline('text/plain; charset=utf-8'), true);
});
