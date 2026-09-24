const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildSrsExportWorkbook, CORE_SHEETS } = require('../src/utils/requirement/srsBaselineExportWorkbook');

describe('srsBaselineExportWorkbook', () => {
  it('defines IEEE-mapped core sheets including Interfaces/Data/Verification', () => {
    const names = CORE_SHEETS.map((s) => s.name);
    assert.ok(names.includes('05_FR'));
    assert.ok(names.includes('09_Interfaces'));
    assert.ok(names.includes('10_Data'));
    assert.ok(names.includes('12_Assumptions'));
    assert.ok(names.includes('13_Verification'));
    assert.ok(names.includes('15_Purpose'));
    assert.ok(names.includes('16_UserCharacteristics'));
    assert.ok(names.includes('17_DesignConstraints'));
    assert.ok(names.includes('18_StandardsCompliance'));
  });

  it('builds a non-empty xlsx buffer from sample artifacts', async () => {
    const buf = await buildSrsExportWorkbook({
      project: { name: 'CRM Demo', code: 'CRM4HV4' },
      srsVersion: 'v-test',
      artifacts: [
        {
          kind: 'FR',
          externalKey: 'FR-001',
          title: 'Register course',
          summary: 'Student enrolls',
          structured: {
            actor: 'Student',
            acceptanceCriteria: 'Given capacity When register Then enrolled',
            priority: 'high',
            relatedSystems: 'SSO',
            dataEntities: 'Enrollment',
          },
        },
        {
          kind: 'UC',
          externalKey: 'UC-001',
          title: 'Enroll course',
          structured: {
            actor: 'Student',
            mainFlow: '1. Open catalog 2. Select 3. Confirm',
            relatedFrKeys: 'FR-001',
          },
        },
        {
          kind: 'NFR',
          externalKey: 'NFR-001',
          title: 'SSO latency',
          structured: { category: 'Performance', target: '<2s', assumption: 'Campus IdP up' },
        },
        {
          kind: 'INTERFACE',
          externalKey: 'IF-001',
          title: 'Campus SSO',
          structured: {
            interfaceName: 'Campus SSO',
            interfaceType: 'auth',
            direction: 'in',
            protocol: 'OIDC',
            description: 'IdP login',
          },
        },
        {
          kind: 'DATA',
          externalKey: 'DATA-001',
          title: 'Enrollment',
          structured: { entity: 'Enrollment', attributes: 'studentId;courseId', validationRules: 'unique pair' },
        },
        {
          kind: 'GLOSSARY',
          externalKey: 'GL-001',
          title: 'SSO',
          structured: { term: 'SSO', definition: 'Single Sign-On' },
        },
        {
          kind: 'ASSUMPTION',
          externalKey: 'ASM-001',
          title: 'IdP available',
          structured: { text: 'Campus SSO available at go-live', impactIfInvalid: 'Local accounts needed' },
        },
      ],
      traceLinks: [
        { fromKind: 'UC', fromKey: 'UC-001', toKind: 'FR', toKey: 'FR-001', linkType: 'implements' },
      ],
    });
    assert.ok(Buffer.isBuffer(buf) || buf instanceof Uint8Array);
    assert.ok(buf.length > 1000);
  });
});
