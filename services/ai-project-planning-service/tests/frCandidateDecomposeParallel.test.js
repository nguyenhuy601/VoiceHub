/**
 * FR decompose — parallel pool preserves order & semantics; timing spans on apply path.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  decomposeFrCandidates,
  resolveFrDecomposeConcurrency,
  mapPool,
  looksMonolithic,
} = require('../src/engines/frCandidateDecompose');
const {
  createWhatTiming,
  markStage,
  finalizeWhatTiming,
  sumStageMs,
  SUM_STAGE_KEYS,
} = require('../src/orchestration/whatTiming');

function monolithicFr(id, extras = {}) {
  return {
    externalId: id,
    name: `Quản lý vai trò ${id}`,
    description:
      'Cho phép thêm vai trò mới với cảnh báo trùng tên, danh sách STT, sửa, xoá, ' +
      'và cấu hình lương nhiệm vụ + hoa hồng KPI trên form.',
    ...extras,
  };
}

describe('resolveFrDecomposeConcurrency', () => {
  it('defaults to 4 and clamps env', () => {
    assert.equal(resolveFrDecomposeConcurrency({}), 4);
    assert.equal(resolveFrDecomposeConcurrency({ PHASE1_FR_DECOMPOSE_CONCURRENCY: '5' }), 5);
    assert.equal(resolveFrDecomposeConcurrency({ PHASE1_FR_DECOMPOSE_CONCURRENCY: '99' }), 16);
    assert.equal(resolveFrDecomposeConcurrency({ PHASE1_FR_DECOMPOSE_CONCURRENCY: '0' }), 4);
  });
});

describe('mapPool', () => {
  it('preserves index order under concurrency', async () => {
    const started = [];
    const out = await mapPool([10, 20, 30, 40], 2, async (n, i) => {
      started.push(i);
      await new Promise((r) => setTimeout(r, 15 - i));
      return n * 2;
    });
    assert.deepEqual(out, [20, 40, 60, 80]);
    assert.equal(started.length, 4);
  });
});

describe('decomposeFrCandidates parallel', () => {
  it('runs LLM calls concurrently and keeps FR order', async () => {
    const active = { n: 0, max: 0 };
    const delays = [40, 10, 25];
    let call = 0;
    const generateJsonFn = async () => {
      active.n += 1;
      active.max = Math.max(active.max, active.n);
      const d = delays[call] ?? 5;
      call += 1;
      await new Promise((r) => setTimeout(r, d));
      active.n -= 1;
      return {
        ok: true,
        skipped: false,
        data: {
          candidates: [
            { name: 'Cảnh báo trùng', behaviorKey: 'dup_warning', openQuestions: [] },
            { name: 'Thêm vai trò', behaviorKey: 'add_role', openQuestions: [] },
            { name: 'Lương nhiệm vụ', behaviorKey: 'task_salary', openQuestions: [] },
            { name: 'Danh sách', behaviorKey: 'list_view', openQuestions: [] },
            { name: 'Sửa', behaviorKey: 'edit', openQuestions: [] },
            { name: 'Xóa', behaviorKey: 'delete', openQuestions: [] },
          ],
        },
      };
    };

    const frs = [monolithicFr('FR-1'), monolithicFr('FR-2'), monolithicFr('FR-3')];
    assert.ok(frs.every(looksMonolithic));

    const t0 = Date.now();
    const result = await decomposeFrCandidates({
      pack: { functionalRequirements: frs },
      env: { AI_PLANNING_LLM: '1', PHASE1_FR_DECOMPOSE_CONCURRENCY: '3' },
      generateJsonFn,
      concurrency: 3,
    });
    const wall = Date.now() - t0;

    assert.equal(result.meta.llmCalls, 3);
    assert.equal(result.meta.concurrency, 3);
    assert.ok(result.meta.durationMs >= 0);
    assert.ok(active.max >= 2, `expected concurrent LLM, maxActive=${active.max}`);
    // Serial would be ~75ms; parallel ~40ms — allow CI slack
    assert.ok(wall < 70, `expected parallel wall <70ms, got ${wall}ms`);

    const sourceIds = result.candidates.map((c) => c.sourceFrId);
    const firstFr1 = sourceIds.indexOf('FR-1');
    const firstFr2 = sourceIds.indexOf('FR-2');
    const firstFr3 = sourceIds.indexOf('FR-3');
    assert.ok(firstFr1 >= 0 && firstFr2 > firstFr1 && firstFr3 > firstFr2);
  });

  it('skips non-monolithic rows without LLM (same as serial)', async () => {
    let calls = 0;
    const result = await decomposeFrCandidates({
      pack: {
        functionalRequirements: [
          { externalId: 'A', name: 'Short', description: 'tiny' },
          { externalId: 'B', name: 'Also short', description: 'x' },
        ],
      },
      env: { AI_PLANNING_LLM: '1' },
      generateJsonFn: async () => {
        calls += 1;
        return { ok: false, skipped: true };
      },
    });
    assert.equal(calls, 0);
    assert.equal(result.meta.skipped, 2);
    assert.equal(result.meta.llmCalls, 0);
    assert.equal(result.candidates.length, 2);
  });
});

describe('whatTiming nested spans', () => {
  it('sumStages excludes fr_decompose / raw_section_derive / g4 sub-stages', () => {
    assert.deepEqual(SUM_STAGE_KEYS, [
      'hydrate',
      'understand',
      'g4_total',
      'bg_derive',
      'engines',
      'meta',
    ]);
    let t = createWhatTiming({ runId: 't1' });
    t = markStage(t, 'understand', { ms: 100 });
    t = markStage(t, 'g4_semantic', { ms: 1000 });
    t = markStage(t, 'g4_synthesis', { ms: 500 });
    t = markStage(t, 'g4_total', { ms: 1500 });
    t = markStage(t, 'bg_derive', {
      ms: 10000,
      fr_decompose: { ms: 8000 },
      raw_section_derive: { ms: 2000 },
    });
    t = markStage(t, 'fr_decompose', { ms: 8000, concurrency: 4 });
    t = markStage(t, 'raw_section_derive', { ms: 2000 });
    t = markStage(t, 'engines', { ms: 10 });
    const final = finalizeWhatTiming(t, { totalMs: 11610 });
    assert.equal(sumStageMs(final.stages), 100 + 1500 + 10000 + 10);
    assert.equal(final.stages.fr_decompose.ms, 8000);
    assert.equal(final.stages.raw_section_derive.ms, 2000);
  });
});
