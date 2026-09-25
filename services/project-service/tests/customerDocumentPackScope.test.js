const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildCustomerDocumentStoragePath,
} = require('../src/utils/analysis/customerDocumentStorage');

describe('customerDocumentPackScope', () => {
  it('builds pack storage path when projectId absent', () => {
    const key = buildCustomerDocumentStoragePath({
      packId: 'pack99',
      docClass: 'customer_raw',
      filename: 'raw.xlsx',
    });
    assert.match(key, /^packs\/pack99\/customer-docs\/customer_raw\/\d+-raw\.xlsx$/);
  });

  it('prefers project path when projectId set', () => {
    const key = buildCustomerDocumentStoragePath({
      projectId: 'proj1',
      packId: 'pack99',
      docClass: 'customer_raw',
      filename: 'raw.xlsx',
    });
    assert.match(key, /^projects\/proj1\/customer-docs\//);
  });

  it('throws when neither projectId nor packId', () => {
    assert.throws(() =>
      buildCustomerDocumentStoragePath({ docClass: 'other', filename: 'a.pdf' })
    );
  });
});
