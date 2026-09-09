'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveJobWallMs,
  resolveCompactJobWallMs,
  remainingWallMs,
  envKeyForJobWall,
  DEFAULT_JOB_WALL_MS,
  WALL_MIN_MS,
  WALL_MAX_MS,
} = require('../src/utils/aiAnalysis/aiAnalysisJobBudgets');

describe('aiAnalysisJobBudgets', () => {
  it('hierarchyDecomposition default is 120000', () => {
    assert.equal(resolveJobWallMs('hierarchyDecomposition', { env: {} }), 120_000);
    assert.equal(DEFAULT_JOB_WALL_MS.hierarchyDecomposition, 120_000);
    assert.equal(
      envKeyForJobWall('hierarchyDecomposition'),
      'AI_ANALYSIS_WALL_MS_HIERARCHY_DECOMPOSITION'
    );
  });

  it('requirementAnalysis default is 300000', () => {
    assert.equal(resolveJobWallMs('requirementAnalysis', { env: {} }), 300_000);
    assert.equal(DEFAULT_JOB_WALL_MS.requirementAnalysis, 300_000);
  });

  it('env AI_ANALYSIS_WALL_MS_REQUIREMENT_ANALYSIS overrides', () => {
    const env = { AI_ANALYSIS_WALL_MS_REQUIREMENT_ANALYSIS: '360000' };
    assert.equal(envKeyForJobWall('requirementAnalysis'), 'AI_ANALYSIS_WALL_MS_REQUIREMENT_ANALYSIS');
    assert.equal(resolveJobWallMs('requirementAnalysis', { env }), 360_000);
  });

  it('clamps below min and above max', () => {
    assert.equal(
      resolveJobWallMs('requirementAnalysis', {
        env: { AI_ANALYSIS_WALL_MS_REQUIREMENT_ANALYSIS: '1000' },
      }),
      WALL_MIN_MS
    );
    assert.equal(
      resolveJobWallMs('requirementAnalysis', {
        env: { AI_ANALYSIS_WALL_MS_REQUIREMENT_ANALYSIS: '9999999' },
      }),
      WALL_MAX_MS
    );
  });

  it('remainingWallMs shrinks after elapsed and respects min', () => {
    const started = 1_000_000;
    assert.equal(remainingWallMs(300_000, started, { now: started + 100_000 }), 200_000);
    assert.equal(remainingWallMs(300_000, started, { now: started + 295_000 }), 15_000);
    assert.equal(remainingWallMs(300_000, started, { now: started + 400_000 }), 15_000);
  });

  it('compact fallback uses AI_ANALYSIS_COMPACT_JOB_WALL_MS when per-job unset', () => {
    const env = { AI_ANALYSIS_COMPACT_JOB_WALL_MS: '150000' };
    assert.equal(resolveCompactJobWallMs('capabilityAnalysis', { env }), 150_000);
    assert.equal(
      resolveCompactJobWallMs('capabilityAnalysis', {
        env: {
          AI_ANALYSIS_COMPACT_JOB_WALL_MS: '150000',
          AI_ANALYSIS_WALL_MS_CAPABILITY_ANALYSIS: '200000',
        },
      }),
      200_000
    );
  });
});
