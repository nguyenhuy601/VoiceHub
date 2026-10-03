import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  artifactRowId,
  buildBrToBgPairs,
  buildBpmToBrPairs,
  buildCrAnalysisRows,
  buildNfrToFrPairs,
  buildScopeCrRows,
  isTcDeepLinkPhase,
  listNfrMissingFr,
} from './traceabilityHubModel.js';

describe('traceabilityHubModel', () => {
  it('buildCrAnalysisRows groups peers by CR id', () => {
    const rows = buildCrAnalysisRows([
      {
        _id: '1',
        kind: 'FR',
        externalKey: 'FR-001',
        title: 'A',
        structured: { customerRequirementIds: ['CR-001', 'CR-002'] },
      },
      {
        id: '2',
        kind: 'BG',
        externalKey: 'BG-001',
        title: 'G',
        structured: { customerRequirementIds: ['CR-001'] },
      },
    ]);
    assert.equal(rows.length, 2);
    const cr1 = rows.find((r) => r.crId === 'CR-001');
    assert.equal(cr1.peers.length, 2);
  });

  it('buildBrToBgPairs merges derives links and soft relatedBgKey', () => {
    const brs = [
      { _id: 'br1', kind: 'BR', externalKey: 'BR-001', structured: { relatedBgKey: 'BG-001' } },
      { _id: 'br2', kind: 'BR', externalKey: 'BR-002', structured: {} },
    ];
    const bgs = [{ _id: 'bg1', kind: 'BG', externalKey: 'BG-001', title: 'Goal' }];
    const links = [
      { linkType: 'derives', fromArtifactId: 'br2', toArtifactId: 'bg1' },
    ];
    const pairs = buildBrToBgPairs({ brs, bgs, links });
    assert.equal(pairs.length, 2);
    assert.ok(pairs.some((p) => p.source === 'key' && artifactRowId(p.br) === 'br1'));
    assert.ok(pairs.some((p) => p.source === 'trace' && artifactRowId(p.br) === 'br2'));
  });

  it('buildBpmToBrPairs reads relatedBrKey', () => {
    const pairs = buildBpmToBrPairs({
      bpms: [
        {
          _id: 'bpm1',
          kind: 'BPM',
          externalKey: 'BPM-001-S1',
          structured: { relatedBrKey: 'BR-001' },
        },
      ],
      brs: [{ _id: 'br1', kind: 'BR', externalKey: 'BR-001', title: 'Rule' }],
      links: [],
    });
    assert.equal(pairs.length, 1);
    assert.equal(pairs[0].br.externalKey, 'BR-001');
  });

  it('buildNfrToFrPairs and listNfrMissingFr', () => {
    const nfrs = [
      { _id: 'n1', kind: 'NFR', externalKey: 'NFR-001', structured: { relatedFrKeys: ['FR-001'] } },
      { _id: 'n2', kind: 'NFR', externalKey: 'NFR-002', structured: {} },
    ];
    const frs = [{ _id: 'f1', kind: 'FR', externalKey: 'FR-001', title: 'Req' }];
    const pairs = buildNfrToFrPairs({ nfrs, frs, links: [] });
    assert.equal(pairs.length, 1);
    const missing = listNfrMissingFr({ nfrs, frs, links: [] });
    assert.equal(missing.length, 1);
    assert.equal(missing[0].externalKey, 'NFR-002');
  });

  it('buildScopeCrRows exposes CR ids', () => {
    const rows = buildScopeCrRows([
      {
        _id: 's1',
        externalKey: 'SC-001',
        structured: { scopeType: 'in', customerRequirementIds: ['CR-001'] },
      },
    ]);
    assert.deepEqual(rows[0].crIds, ['CR-001']);
  });

  it('isTcDeepLinkPhase gates phases', () => {
    assert.equal(isTcDeepLinkPhase('requirement_analysis'), false);
    assert.equal(isTcDeepLinkPhase('qa_uat'), true);
    assert.equal(isTcDeepLinkPhase('development'), true);
  });
});
