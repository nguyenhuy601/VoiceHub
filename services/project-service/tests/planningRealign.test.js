const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  nextArtifactVersion,
  buildForkDraftFromArtifact,
} = require('../src/utils/planning/forkPlanningArtifact');
const {
  parsePlanningDumpJson,
  parsePlanningDumpCsv,
  parsePlanningDumpPayload,
} = require('../src/utils/planning/planningDumpParse');

describe('forkPlanningArtifact RULE-20', () => {
  it('bumps version', () => {
    assert.equal(nextArtifactVersion(1), 2);
    assert.equal(nextArtifactVersion(3), 4);
  });

  it('builds draft from approved only', () => {
    const d = buildForkDraftFromArtifact(
      {
        _id: 'a1',
        kind: 'WBS',
        externalKey: 'WBS-1',
        title: 'T',
        status: 'approved',
        version: 1,
        structured: { effortHours: 8 },
      },
      'u1'
    );
    assert.equal(d.version, 2);
    assert.equal(d.forkedFromVersion, 1);
    assert.throws(() =>
      buildForkDraftFromArtifact({ kind: 'WBS', externalKey: 'x', title: 't', status: 'draft' }, 'u')
    );
  });
});

describe('planningDumpParse RULE-22', () => {
  it('parses JSON array', () => {
    const { rows, errors } = parsePlanningDumpJson([
      { kind: 'WBS', externalKey: 'W1', title: 'Work' },
      { kind: 'NOPE', externalKey: 'x', title: 'bad' },
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].kind, 'WBS');
    assert.ok(errors.length >= 1);
  });

  it('parses CSV', () => {
    const csv = 'kind,externalKey,title,summary\nRISK,R1,Risk one,desc\n';
    const { rows } = parsePlanningDumpCsv(csv);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].kind, 'RISK');
  });

  it('parses payload wrapper', () => {
    const { rows, format } = parsePlanningDumpPayload({
      format: 'json',
      text: JSON.stringify([{ kind: 'SCHEDULE', externalKey: 'S1', title: 'Sch' }]),
    });
    assert.equal(format, 'json');
    assert.equal(rows.length, 1);
  });

  it('builds xlsx template and parses it back', () => {
    let xlsxOk = true;
    try {
      require('xlsx');
    } catch {
      xlsxOk = false;
    }
    if (!xlsxOk) {
      // Host may not have node_modules; image Swarm có xlsx trong package.json
      return;
    }
    const {
      buildPlanningDumpTemplateBuffer,
      parsePlanningDumpXlsx,
    } = require('../src/utils/planning/planningDumpParse');
    const buf = buildPlanningDumpTemplateBuffer();
    assert.ok(Buffer.isBuffer(buf) && buf.length > 100);
    const { rows } = parsePlanningDumpXlsx(buf);
    assert.ok(rows.length >= 1);
    assert.equal(rows[0].kind, 'WBS');
  });
});
