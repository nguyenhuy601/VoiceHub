import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canRenderAvatarImage,
  needsAuthenticatedAvatarFetch,
  pickAvatarValue,
} from './avatarDisplay.js';

describe('avatarDisplay sync helpers', () => {
  it('pickAvatarValue bóc string/object', () => {
    assert.equal(pickAvatarValue(' /uploads/a.png '), '/uploads/a.png');
    assert.equal(pickAvatarValue({ avatarUrl: '/uploads/b.jpg' }), '/uploads/b.jpg');
    assert.equal(pickAvatarValue(null), null);
  });

  it('có userId → luôn auth fetch (kể cả avatar null)', () => {
    assert.equal(needsAuthenticatedAvatarFetch(null, 'u1'), true);
    assert.equal(needsAuthenticatedAvatarFetch('', 'u1'), true);
    assert.equal(needsAuthenticatedAvatarFetch('/uploads/x.png', 'u1'), true);
  });

  it('không userId: chỉ fetch khi uploads path', () => {
    assert.equal(needsAuthenticatedAvatarFetch(null, null), false);
    assert.equal(needsAuthenticatedAvatarFetch('/uploads/x.png', null), true);
    assert.equal(needsAuthenticatedAvatarFetch('https://cdn.example/a.png', null), false);
  });

  it('data URL preview không auth-fetch (kể cả có userId)', () => {
    assert.equal(needsAuthenticatedAvatarFetch('data:image/png;base64,aaa', 'u1'), false);
  });

  it('canRenderAvatarImage chỉ khi có src thật', () => {
    assert.equal(
      canRenderAvatarImage({ avatar: null, resolvedSrc: 'blob:http://x', imgFailed: false }),
      true
    );
    assert.equal(
      canRenderAvatarImage({ avatar: '/uploads/a.png', resolvedSrc: null, imgFailed: false }),
      false
    );
    assert.equal(
      canRenderAvatarImage({ avatar: null, resolvedSrc: 'blob:x', imgFailed: true }),
      false
    );
    assert.equal(canRenderAvatarImage({ avatar: null, resolvedSrc: null }), false);
  });

  it('sanitizeAvatarRingExtra bỏ bg/rounded lệch màu', async () => {
    const { sanitizeAvatarRingExtra, avatarPlaceholderClassName } = await import('./avatarDisplay.js');
    assert.equal(
      sanitizeAvatarRingExtra('border border-border bg-muted rounded-full text-primary h-10 w-10'),
      'border border-border'
    );
    const cls = avatarPlaceholderClassName('Jay Nguyễn', 'md', 'bg-primary/10 rounded-full');
    assert.ok(cls.includes('bg-'));
    assert.ok(!cls.includes('bg-primary/10'));
    assert.ok(!cls.includes('rounded-full'));
    assert.ok(cls.includes('rounded-xl'));
  });
});
