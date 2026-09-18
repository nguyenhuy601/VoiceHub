import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getArtifactListColumns,
  truncateCell,
  COLUMNS_BY_KIND,
} from './artifactListColumns.js';

function ids(kind) {
  return getArtifactListColumns(kind).map((c) => c.id);
}

describe('artifactListColumns', () => {
  it('every known kind includes id and status', () => {
    for (const kind of Object.keys(COLUMNS_BY_KIND)) {
      const colIds = ids(kind);
      assert.ok(colIds.includes('id'), `${kind} missing id`);
      assert.ok(colIds.includes('status'), `${kind} missing status`);
      assert.equal(colIds[0], 'id');
      assert.equal(colIds[colIds.length - 1], 'status');
    }
  });

  it('FR is Key, Level, Artifact, Priority, Source, Import Set, Status', () => {
    assert.deepEqual(ids('FR'), [
      'id',
      'level',
      'artifact',
      'priority',
      'source',
      'importSet',
      'status',
    ]);
    assert.equal(ids('FR').includes('module'), false);
    assert.equal(ids('FR').includes('feature'), false);
    assert.equal(ids('FR').includes('requirement'), false);
    const artifact = getArtifactListColumns('FR').find((c) => c.id === 'artifact');
    assert.equal(artifact.getValue({ title: 'Register course' }), 'Register course');
  });

  it('NFR includes Category and Target', () => {
    const colIds = ids('NFR');
    assert.deepEqual(colIds, [
      'id',
      'category',
      'requirement',
      'target',
      'priority',
      'source',
      'importSet',
      'status',
    ]);
  });

  it('BR includes Related BG', () => {
    assert.ok(ids('BR').includes('relatedBg'));
  });

  it('BG / BPM / UC / SCOPE column sets match plan', () => {
    assert.deepEqual(ids('BG'), [
      'id',
      'title',
      'statement',
      'successMetric',
      'priority',
      'source',
      'importSet',
      'status',
    ]);
    assert.deepEqual(ids('BPM'), [
      'id',
      'processName',
      'step',
      'actor',
      'action',
      'relatedSystems',
      'source',
      'importSet',
      'status',
    ]);
    assert.deepEqual(ids('UC'), [
      'id',
      'title',
      'actor',
      'precondition',
      'relatedFr',
      'priority',
      'source',
      'importSet',
      'status',
    ]);
    assert.deepEqual(ids('SCOPE'), [
      'id',
      'scopeType',
      'scopeDescription',
      'source',
      'importSet',
      'status',
    ]);
  });

  it('unknown kind falls back to id/title/status', () => {
    assert.deepEqual(ids('UNKNOWN'), ['id', 'title', 'source', 'importSet', 'status']);
    assert.deepEqual(ids(''), ['id', 'title', 'source', 'importSet', 'status']);
  });

  it('getValue reads structured fields null-safely', () => {
    const cols = getArtifactListColumns('NFR');
    const byId = Object.fromEntries(cols.map((c) => [c.id, c]));
    const row = {
      externalKey: 'NFR-001',
      title: 'Fast API',
      status: 'draft',
      structured: { category: 'Performance', target: '< 2 sec', priority: 'High' },
    };
    assert.equal(byId.category.getValue(row), 'Performance');
    assert.equal(byId.target.getValue(row), '< 2 sec');
    assert.equal(byId.requirement.getValue(row), 'Fast API');
    assert.equal(byId.target.getValue({ structured: { metric: 'p95' } }), 'p95');
    assert.equal(byId.category.getValue({}), '');
    assert.equal(byId.category.getValue(null), '');
  });

  it('Related FR joins array keys', () => {
    const relatedFr = getArtifactListColumns('UC').find((c) => c.id === 'relatedFr');
    assert.equal(
      relatedFr.getValue({ structured: { relatedFrKeys: ['FR-001', 'FR-002'] } }),
      'FR-001, FR-002'
    );
  });

  it('truncateCell ellipsizes long text', () => {
    assert.equal(truncateCell('short'), 'short');
    const long = 'a'.repeat(120);
    const out = truncateCell(long, 100);
    assert.equal(out.length, 100);
    assert.ok(out.endsWith('…'));
  });
});
