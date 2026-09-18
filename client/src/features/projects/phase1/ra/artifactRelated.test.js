import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  listStructuredRelationKeys,
  modulePathForArtifactKind,
  resolveArtifactRelated,
} from './artifactRelated.js';

describe('artifactRelated (Wave 4)', () => {
  it('lists structured soft keys', () => {
    const keys = listStructuredRelationKeys({
      relatedUcKeys: ['UC-1', 'UC-2'],
      relatedFrKeys: ['FR-1'],
      relatedBgKey: 'BG-1',
      brIds: ['BR-9'],
    });
    assert.deepEqual(
      keys.map((k) => `${k.expectKind}:${k.key}`),
      ['UC:UC-1', 'UC:UC-2', 'FR:FR-1', 'BG:BG-1', 'BR:BR-9']
    );
  });

  it('resolves bidirectional trace links with key+title', () => {
    const fr = { id: 'fr1', externalKey: 'FR-1', title: 'Login', kind: 'FR', status: 'draft' };
    const uc = { id: 'uc1', externalKey: 'UC-1', title: 'Sign in', kind: 'UC', status: 'approved' };
    const related = resolveArtifactRelated({
      artifact: fr,
      links: [{ fromArtifactId: 'uc1', toArtifactId: 'fr1', linkType: 'implements' }],
      catalog: [fr, uc],
    });
    assert.equal(related.length, 1);
    assert.equal(related[0].externalKey, 'UC-1');
    assert.equal(related[0].title, 'Sign in');
    assert.equal(related[0].source, 'trace');
    assert.equal(related[0].linkType, 'implements');
  });

  it('resolves soft keys and prefers trace over key for same peer', () => {
    const fr = {
      id: 'fr1',
      externalKey: 'FR-1',
      title: 'Login',
      kind: 'FR',
      structured: { relatedUcKeys: ['UC-1'] },
    };
    const uc = { id: 'uc1', externalKey: 'UC-1', title: 'Sign in', kind: 'UC' };
    const related = resolveArtifactRelated({
      artifact: fr,
      links: [{ fromArtifactId: 'uc1', toArtifactId: 'fr1', linkType: 'implements' }],
      catalog: [fr, uc],
    });
    assert.equal(related.length, 1);
    assert.equal(related[0].source, 'trace');
  });

  it('keeps unresolved soft key with empty title', () => {
    const fr = {
      id: 'fr1',
      externalKey: 'FR-1',
      title: 'Login',
      kind: 'FR',
      structured: { relatedUcKeys: ['UC-MISSING'] },
    };
    const related = resolveArtifactRelated({ artifact: fr, links: [], catalog: [fr] });
    assert.equal(related.length, 1);
    assert.equal(related[0].unresolved, true);
    assert.equal(related[0].externalKey, 'UC-MISSING');
    assert.equal(related[0].title, '');
  });

  it('maps kind to analysis module path', () => {
    assert.equal(modulePathForArtifactKind('UC'), 'analysis-uc');
    assert.equal(modulePathForArtifactKind('fr'), 'analysis-fr');
    assert.equal(modulePathForArtifactKind('XYZ'), null);
  });
});
