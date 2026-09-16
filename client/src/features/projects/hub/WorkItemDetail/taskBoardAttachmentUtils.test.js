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
  ensureTypedBlob,
} from '../../board/taskBoardAttachmentDisplay.js';

test('resolveAttachmentContentType cho markdown', () => {
  assert.equal(
    resolveAttachmentContentType({ name: 'demo.md' }, 'temp/u1/x_demo.md'),
    'text/plain; charset=utf-8'
  );
  assert.equal(shouldOpenAttachmentInline('text/plain; charset=utf-8'), true);
});

test('ensureTypedBlob từ chối null / Blob chữ null', async () => {
  await assert.rejects(() => ensureTypedBlob(null, 'text/plain'), /Không tải được/);
  await assert.rejects(
    () => ensureTypedBlob(new Blob(['null'], { type: 'application/json' }), 'text/plain'),
    /Không tải được/
  );
});

test('ensureTypedBlob giữ nội dung text hợp lệ', async () => {
  const out = await ensureTypedBlob(new Blob(['# hello'], { type: 'application/octet-stream' }), 'text/plain');
  assert.equal(await out.text(), '# hello');
  assert.match(out.type, /^text\/plain/);
});
