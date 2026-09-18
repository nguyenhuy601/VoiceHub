/**
 * FE unit tests — deliveryPhase nav allowlist.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  coerceDeliveryPhase,
  isModuleAllowedForPhase,
  filterNavItemsByDeliveryPhase,
  filterNavItemsByCapabilities,
  isAnalysisViewModule,
  isPlanningViewModule,
  phaseHomeModule,
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

  it('phase home: board for Phase 2 development/qa', () => {
    assert.equal(phaseHomeModule('development'), 'board');
    assert.equal(phaseHomeModule('qa_uat'), 'board');
    assert.equal(phaseHomeModule('requirement_analysis'), 'overview');
    assert.equal(phaseHomeModule(''), 'board');
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

  it('classifies analysis and planning view modules', () => {
    assert.equal(isAnalysisViewModule('analysis-fr'), true);
    assert.equal(isAnalysisViewModule('customer-documents'), true);
    assert.equal(isAnalysisViewModule('overview'), false);
    assert.equal(isPlanningViewModule('planning-wbs'), true);
    assert.equal(isPlanningViewModule('planning/overview'), true);
    assert.equal(isPlanningViewModule('delivery-planning'), true);
    assert.equal(isPlanningViewModule('planning'), false);
  });

  it('locks analysis nav when canViewAnalysis is false (does not drop)', () => {
    const items = [
      { key: 'overview', module: 'overview' },
      { key: 'analysis-fr', module: 'analysis-fr' },
      { key: 'customer-documents', module: 'customer-documents' },
      { key: 'chat', module: 'chat' },
      { key: 'planning-wbs', module: 'planning-wbs' },
    ];
    const filtered = filterNavItemsByCapabilities(items, {
      canViewAnalysis: false,
      canViewPlanning: true,
    });
    assert.deepEqual(
      filtered.map((i) => i.module),
      ['overview', 'analysis-fr', 'customer-documents', 'chat', 'planning-wbs']
    );
    assert.equal(filtered.find((i) => i.module === 'analysis-fr').locked, true);
    assert.equal(filtered.find((i) => i.module === 'customer-documents').locked, true);
    assert.equal(filtered.find((i) => i.module === 'overview').locked, undefined);
    assert.equal(filtered.find((i) => i.module === 'planning-wbs').locked, undefined);
  });

  it('locks planning nav when canViewPlanning is false (does not drop)', () => {
    const items = [
      { key: 'overview', module: 'overview' },
      { key: 'analysis-fr', module: 'analysis-fr' },
      { key: 'planning-wbs', module: 'planning-wbs' },
    ];
    const filtered = filterNavItemsByCapabilities(items, {
      canViewAnalysis: true,
      canViewPlanning: false,
    });
    assert.deepEqual(
      filtered.map((i) => i.module),
      ['overview', 'analysis-fr', 'planning-wbs']
    );
    assert.equal(filtered.find((i) => i.module === 'planning-wbs').locked, true);
    assert.equal(filtered.find((i) => i.module === 'analysis-fr').locked, undefined);
  });

  it('skips capability filter when capabilities is null', () => {
    const items = [{ key: 'analysis-fr', module: 'analysis-fr' }];
    assert.equal(filterNavItemsByCapabilities(items, null).length, 1);
  });

  it('shows analysis nav when role-backed canViewAnalysis is true (PO/BA)', () => {
    const items = [
      { key: 'overview', module: 'overview' },
      { key: 'analysis-fr', module: 'analysis-fr' },
      { key: 'customer-documents', module: 'customer-documents' },
      { key: 'chat', module: 'chat' },
    ];
    // Caps from BE Project Role matrix (not org Permission Group)
    const filtered = filterNavItemsByCapabilities(items, {
      canViewAnalysis: true,
      canViewPlanning: true,
    });
    assert.deepEqual(
      filtered.map((i) => i.module),
      ['overview', 'analysis-fr', 'customer-documents', 'chat']
    );
  });
});
