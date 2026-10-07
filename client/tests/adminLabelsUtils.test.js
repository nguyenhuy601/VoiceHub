import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { aggregateBoardLabels } from '../src/features/adminTasks/adminLabelsUtils.js';

describe('aggregateBoardLabels', () => {
  it('trim, bỏ rỗng, gộp không phân biệt hoa/thường', () => {
    const rows = aggregateBoardLabels([
      { tags: [' Bug ', 'ui', ''] },
      { tags: ['bug', '   ', null] },
      { tags: ['UI'] },
    ]);
    assert.deepEqual(rows, [
      { label: 'Bug', count: 2 },
      { label: 'ui', count: 2 },
    ]);
  });

  it('đếm mỗi thẻ một lần dù nhãn lặp trong thẻ', () => {
    assert.deepEqual(aggregateBoardLabels([{ tags: ['api', 'API', 'api'] }]), [{ label: 'api', count: 1 }]);
  });

  it('sắp count giảm dần, bằng nhau thì theo tên', () => {
    const rows = aggregateBoardLabels([
      { tags: ['zeta', 'alpha'] },
      { tags: ['zeta', 'beta'] },
    ]);
    assert.deepEqual(
      rows.map((r) => r.label),
      ['zeta', 'alpha', 'beta']
    );
  });

  it('input rỗng/không hợp lệ → []', () => {
    assert.deepEqual(aggregateBoardLabels(null), []);
    assert.deepEqual(aggregateBoardLabels([{}, { tags: 'x' }]), []);
  });
});
