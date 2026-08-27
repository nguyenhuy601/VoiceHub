import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  guessMimeFromFileName,
  resolveTaskAttachmentMime,
} from '../../board/taskBoardAttachmentMime.js';

test('guessMimeFromFileName nhận diện office và ảnh', () => {
  assert.equal(guessMimeFromFileName('report.pdf'), 'application/pdf');
  assert.equal(guessMimeFromFileName('photo.PNG'), 'image/png');
  assert.equal(guessMimeFromFileName('notes.md'), 'text/plain');
  assert.equal(guessMimeFromFileName('data.xlsx'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
});

test('resolveTaskAttachmentMime từ chối octet-stream không đuôi', () => {
  assert.equal(resolveTaskAttachmentMime({ name: 'blob', type: 'application/octet-stream' }), '');
  assert.equal(resolveTaskAttachmentMime({ name: 'notes.txt', type: '' }), 'text/plain');
  assert.equal(
    resolveTaskAttachmentMime({ name: 'doc.pdf', type: 'application/octet-stream' }),
    'application/pdf'
  );
});
