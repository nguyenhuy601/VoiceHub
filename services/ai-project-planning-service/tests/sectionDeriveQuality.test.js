const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  applySectionDeriveQuality,
  filterDataEntities,
  filterInterfaces,
  buildDeterministicEntities,
  buildDeterministicInterfaces,
} = require('../src/semantic/sectionDeriveQuality');
const {
  buildDataDeriveInput,
  buildInterfaceDeriveInput,
} = require('../src/semantic/buildSectionDeriveInputs');
const {
  resolveDeriveLogicalId,
  mapRowToItem,
  runRawSectionDerive,
} = require('../src/semantic/runRawSectionDerive');

const pack = {
  overview: {
    requirementName: 'Employee Mgmt',
    projectObjective: 'Manage employees, leave, attendance; replace Excel',
    businessScope: 'HR web app',
    expectedUsers: 'Nhân viên, HR Admin, HR Manager, System Admin',
    platform: 'Web, API nội bộ',
  },
  functionalRequirements: [
    {
      externalId: 'CR-001',
      name: 'HR tạo hồ sơ nhân viên mới với mã NV',
      module: 'Hồ sơ nhân viên',
      actor: 'HR Admin',
    },
    {
      externalId: 'CR-007',
      name: 'HR nhập hàng loạt nhân viên từ file Excel/CSV theo mẫu',
      module: 'Hồ sơ nhân viên',
      actor: 'HR Admin',
    },
    {
      externalId: 'CR-020',
      name: 'Gửi thông báo email khi duyệt nghỉ phép',
      module: 'Nghỉ phép',
      actor: 'Hệ thống',
    },
    {
      externalId: 'CR-030',
      name: 'Xuất báo cáo headcount ra Excel',
      module: 'Báo cáo',
      actor: 'HR Manager',
    },
  ],
  nonFunctionalRequirements: [{ id: 'NFR-003', category: 'Security', statement: 'SSO preferred' }],
  aiAnalysis: { formValidation: { ok: true, recognizedAsCustomerRaw: true } },
};

describe('sectionDeriveQuality data', () => {
  it('filters actor-like entity names', () => {
    const filtered = filterDataEntities(
      [
        { name: 'HR Admin' },
        { name: 'Nhân viên' },
        { name: 'Employee', attributes: ['code'] },
        { name: 'LeaveRequest' },
      ],
      pack,
      buildDataDeriveInput(pack)
    );
    assert.deepEqual(
      filtered.map((r) => r.name).sort(),
      ['Employee', 'LeaveRequest']
    );
  });

  it('seeds domain entities when LLM returns only actors', () => {
    const input = buildDataDeriveInput(pack);
    const pass = applySectionDeriveQuality(
      'data',
      [{ name: 'HR Admin' }, { name: 'System Admin' }],
      pack,
      input
    );
    assert.equal(pass.quality.seeded, true);
    assert.ok(pass.rows.length >= 2);
    assert.ok(pass.rows.every((r) => !/admin|nhân viên/i.test(r.name)));
    assert.ok(pass.rows.some((r) => /Employee/i.test(r.name)));
  });

  it('data input omits actor and lists forbidNames', () => {
    const input = buildDataDeriveInput(pack);
    assert.ok(input.frSlim.every((r) => !('actor' in r)));
    assert.ok(input.forbidNames.some((n) => /HR Admin/i.test(n)));
    assert.match(input.deriveInstruction, /NOT actors/i);
  });
});

describe('sectionDeriveQuality interface', () => {
  it('filters FR-copied interface names', () => {
    const input = buildInterfaceDeriveInput(pack);
    const filtered = filterInterfaces(
      [
        {
          name: 'HR tạo hồ sơ nhân viên mới với mã NV',
        },
        { name: 'Email notification gateway', protocol: 'SMTP' },
      ],
      pack,
      input
    );
    assert.equal(filtered.length, 1);
    assert.match(filtered[0].name, /Email/i);
  });

  it('seeds interfaces from Excel/email signals', () => {
    const seeded = buildDeterministicInterfaces(pack, buildInterfaceDeriveInput(pack));
    assert.ok(seeded.some((r) => /Excel|CSV/i.test(r.name)));
    assert.ok(seeded.some((r) => /Email/i.test(r.name)));
  });

  it('interface input prefers integration FR signals', () => {
    const input = buildInterfaceDeriveInput(pack);
    assert.ok(input.integrationSignals.some((r) => /Excel|email|CSV/i.test(r.name)));
    assert.ok(!input.integrationSignals.some((r) => r.actor));
    assert.match(input.deriveInstruction, /NOT FR titles/i);
  });

  it('deterministic entity seed covers modules', () => {
    const ents = buildDeterministicEntities(pack, buildDataDeriveInput(pack));
    assert.ok(ents.some((e) => e.name === 'Employee'));
  });

  it('GROUNDED_FIRST skips LLM for data/interface/uc/bpm', async () => {
    let calls = 0;
    const env = {
      ...process.env,
      PHASE1_RAW_SECTION_DERIVE: '1',
      PHASE1_RAW_DERIVE_SECTIONS: 'data,interface,uc,bpm',
      PHASE1_DATA_GROUNDED_FIRST: '1',
      PHASE1_INTERFACE_GROUNDED_FIRST: '1',
      PHASE1_UC_GROUNDED_FIRST: '1',
      PHASE1_BPM_GROUNDED_FIRST: '1',
      OLLAMA_BASE_URL: 'http://127.0.0.1:9',
    };
    const invokeFn = async () => {
      calls += 1;
      return { ok: true, data: {} };
    };
    for (const id of ['data', 'interface', 'uc', 'bpm']) {
      const out = await runRawSectionDerive({ engineId: id, pack, env, invokeFn });
      assert.equal(out.reason, 'GROUNDED_FIRST', id);
      assert.equal(out.llmCalls, 0, id);
      assert.ok(out.items.length >= 2, id);
    }
    assert.equal(calls, 0);
  });

  it('does not use CR-/FR- as interface/entity logicalId', () => {
    assert.equal(resolveDeriveLogicalId('interface', { id: 'CR-006', name: 'Email' }, 0), 'IF-1');
    assert.equal(resolveDeriveLogicalId('data', { id: 'FR-1', name: 'Employee' }, 2), 'ENT-3');
    assert.equal(resolveDeriveLogicalId('bg', { goalId: 'BRQ-001', statement: 'G' }, 0), 'BRQ-001');
    const item = mapRowToItem('interface', { id: 'CR-007', name: 'Excel import', protocol: 'file' }, 1);
    assert.equal(item.logicalId, 'IF-2');
    assert.match(item.title, /Excel/i);
  });
});
