/**
 * FE unit tests — deliveryPhase nav allowlist.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  coerceDeliveryPhase,
  isModuleAllowedForPhase,
  filterNavItemsByDeliveryPhase,
  DEVELOPMENT_MODULES,
} from './projectPhaseNav.js';

describe('projectPhaseNav', () => {
  it('coerces missing phase to development', () => {
    assert.equal(coerceDeliveryPhase(''), 'development');
    assert.equal(coerceDeliveryPhase(null), 'development');
  });

  it('allows board only in development', () => {
    assert.equal(isModuleAllowedForPhase('board', 'development'), true);
    assert.equal(isModuleAllowedForPhase('board', 'requirement_analysis'), false);
  });

  it('allows analysis-bg in requirement_analysis', () => {
    assert.equal(isModuleAllowedForPhase('analysis-bg', 'requirement_analysis'), true);
    assert.equal(isModuleAllowedForPhase('analysis-bg', 'development'), false);
  });

  it('development modules match legacy suite set', () => {
    assert.ok(DEVELOPMENT_MODULES.includes('list'));
    assert.ok(DEVELOPMENT_MODULES.includes('change-requests'));
  });

  it('filters nav items by phase', () => {
    const items = [
      { key: 'board', module: 'board' },
      { key: 'analysis-fr', module: 'analysis-fr' },
      { key: 'chat', module: 'chat' },
    ];
    const filtered = filterNavItemsByDeliveryPhase(items, 'requirement_analysis');
    assert.deepEqual(
      filtered.map((i) => i.module),
      ['analysis-fr', 'chat']
    );
  });
});
