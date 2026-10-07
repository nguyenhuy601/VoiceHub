import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  beamAngleDeg,
  isOwlAimAngle,
  isPasswordAimAngle,
  normalizeDeg,
} from '../src/components/Auth/loginFlashlightHit.js';

describe('beamAngleDeg', () => {
  it('points left ≈ ±180', () => {
    const a = Math.abs(normalizeDeg(beamAngleDeg(100, 100, 0, 100)));
    assert.ok(Math.abs(a - 180) < 0.01);
  });

  it('points up-left ≈ -135', () => {
    const a = beamAngleDeg(200, 200, 100, 100);
    assert.ok(a < -120 && a > -150);
  });
});

describe('aim angles', () => {
  it('password aim near -180', () => {
    assert.equal(isPasswordAimAngle(-180), true);
    assert.equal(isPasswordAimAngle(-170), true);
    assert.equal(isPasswordAimAngle(175), true);
    assert.equal(isPasswordAimAngle(-90), false);
  });

  it('owl aim up-left', () => {
    assert.equal(isOwlAimAngle(-140), true);
    assert.equal(isOwlAimAngle(-150), true);
    assert.equal(isOwlAimAngle(-180), false);
    assert.equal(isOwlAimAngle(-90), false);
  });
});
