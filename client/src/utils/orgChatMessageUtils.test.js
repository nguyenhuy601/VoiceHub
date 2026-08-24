import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isAttachmentStorageUrl,
  resolveAttachmentUserCaption,
  resolveAttachmentReadUrl,
  plainTextForMessage,
} from './orgChatMessageUtils.js';

const SIGNED =
  'https://storage.googleapis.com/voicehub-0305.firebasestorage.app/temp/u1/x_demo.md?X-Goog-Signature=abc';

describe('orgChatMessageUtils attachment display', () => {
  it('isAttachmentStorageUrl nhận diện signed GCS URL', () => {
    assert.equal(isAttachmentStorageUrl(SIGNED), true);
    assert.equal(isAttachmentStorageUrl('https://example.com/file.md'), false);
  });

  it('resolveAttachmentUserCaption ẩn signed URL và tên file mặc định', () => {
    assert.equal(
      resolveAttachmentUserCaption({
        content: SIGNED,
        fileMeta: { originalName: 'demo.md' },
      }),
      ''
    );
    assert.equal(
      resolveAttachmentUserCaption({
        content: 'demo.md',
        fileMeta: { originalName: 'demo.md' },
      }),
      ''
    );
    assert.equal(
      resolveAttachmentUserCaption({
        content: 'Ghi chú test',
        fileMeta: { originalName: 'demo.md' },
      }),
      'Ghi chú test'
    );
  });

  it('resolveAttachmentReadUrl ưu tiên signedReadUrl', () => {
    assert.equal(
      resolveAttachmentReadUrl({
        content: 'demo.md',
        signedReadUrl: SIGNED,
      }),
      SIGNED
    );
    assert.equal(
      resolveAttachmentReadUrl({
        content: SIGNED,
      }),
      SIGNED
    );
  });

  it('plainTextForMessage không trả URL dài cho file', () => {
    assert.equal(
      plainTextForMessage(
        { messageType: 'file', content: SIGNED, fileMeta: { originalName: 'demo.md' } },
        'Attachment'
      ),
      'demo.md'
    );
  });
});
