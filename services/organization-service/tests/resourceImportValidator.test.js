const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  validateResourceImportRows,
  splitFullName,
  normalizeOptionalPhone,
  normalizePrimaryDomain,
} = require('../src/utils/resourceImportValidator');

function baseRow(overrides = {}) {
  return {
    rowNumber: 2,
    employeeCode: 'VH-001',
    fullName: 'Yến Bình',
    email: 'a@voicehub.net',
    phone: '',
    departmentCode: 'PMO',
    jobTitle: 'BA',
    primaryDomain: 'ba',
    skills: 'Jira',
    yearsExperience: 1,
    maxConcurrentProjects: 2,
    orgRole: '',
    ...overrides,
  };
}

describe('resourceImportValidator', () => {
  it('allows blank employeeCode (auto-allocate later)', () => {
    const out = validateResourceImportRows([baseRow({ employeeCode: '' })]);
    assert.equal(out.ok, true);
    assert.equal(out.normalizedRows[0].employeeCode, null);
    assert.equal(out.normalizedRows[0].needsEmployeeCodeAllocate, true);
  });

  it('rejects NV / non VH- convention', () => {
    const nv = validateResourceImportRows([baseRow({ employeeCode: 'NV-01' })]);
    assert.equal(nv.ok, false);
    assert.equal(nv.details?.[0]?.errorCode, 'VALIDATION_EMPLOYEE_CODE_FORMAT');

    const spaced = validateResourceImportRows([baseRow({ employeeCode: 'VH 1' })]);
    assert.equal(spaced.ok, false);
    assert.equal(spaced.details?.[0]?.errorCode, 'VALIDATION_EMPLOYEE_CODE_FORMAT');

    const bad = validateResourceImportRows([baseRow({ employeeCode: 'VH@1' })]);
    assert.equal(bad.ok, false);
    assert.equal(bad.details?.[0]?.errorCode, 'VALIDATION_EMPLOYEE_CODE_FORMAT');
  });

  it('normalizes employeeCode to VH-001 (pad + bare VH001)', () => {
    const lower = validateResourceImportRows([baseRow({ employeeCode: 'vh-1' })]);
    assert.equal(lower.ok, true);
    assert.equal(lower.normalizedRows[0].employeeCode, 'VH-001');

    const bare = validateResourceImportRows([baseRow({ employeeCode: 'VH001' })]);
    assert.equal(bare.ok, true);
    assert.equal(bare.normalizedRows[0].employeeCode, 'VH-001');
  });

  it('rejects duplicate employeeCode in same file (case-insensitive)', () => {
    const out = validateResourceImportRows([
      baseRow({ employeeCode: 'VH-001', email: 'a@voicehub.net', rowNumber: 2 }),
      baseRow({
        employeeCode: 'vh001',
        email: 'b@voicehub.net',
        rowNumber: 3,
        fullName: 'Nguyễn An',
      }),
    ]);
    assert.equal(out.ok, false);
    assert.equal(out.errorCode, 'VALIDATION_ERROR');
    const codes = (out.details || []).map((d) => d.errorCode);
    assert.ok(codes.includes('VALIDATION_EMPLOYEE_CODE_DUPLICATE'));
  });

  it('rejects when fullName is missing', () => {
    const out = validateResourceImportRows([baseRow({ fullName: '' })]);
    assert.equal(out.ok, false);
    assert.equal(out.errorCode, 'VALIDATION_ERROR');
    assert.equal(out.details?.[0]?.errorCode, 'VALIDATION_FULL_NAME_REQUIRED');
  });

  it('rejects when primaryDomain is missing', () => {
    const out = validateResourceImportRows([baseRow({ primaryDomain: '' })]);
    assert.equal(out.ok, false);
    assert.equal(out.details?.[0]?.errorCode, 'VALIDATION_PRIMARY_DOMAIN_REQUIRED');
  });

  it('rejects when phone is present but invalid', () => {
    const out = validateResourceImportRows([baseRow({ phone: '123' })]);
    assert.equal(out.ok, false);
    assert.equal(out.details?.[0]?.errorCode, 'VALIDATION_PHONE_INVALID');
  });

  it('accepts blank phone and normalizes +84', () => {
    const blank = validateResourceImportRows([baseRow({ phone: '' })]);
    assert.equal(blank.ok, true);
    assert.equal(blank.normalizedRows[0].phone, null);

    const plus = validateResourceImportRows([baseRow({ phone: '+84901234567' })]);
    assert.equal(plus.ok, true);
    assert.equal(plus.normalizedRows[0].phone, '0901234567');
  });

  it('rejects when jobTitle is missing', () => {
    const out = validateResourceImportRows([baseRow({ jobTitle: '' })]);
    assert.equal(out.ok, false);
    assert.equal(out.errorCode, 'VALIDATION_ERROR');
    assert.equal(out.details?.[0]?.errorCode, 'VALIDATION_JOB_TITLE_REQUIRED');
  });

  it('rejects entire file when orgRole contains owner', () => {
    const out = validateResourceImportRows([baseRow({ orgRole: 'owner' })]);
    assert.equal(out.ok, false);
    assert.equal(out.errorCode, 'SECURITY_VIOLATION_ERROR');
    assert.match(String(out.details?.[0]?.message || ''), /owner/i);
  });

  it('defaults orgRole blank -> employ -> member and splits fullName', () => {
    const out = validateResourceImportRows([
      baseRow({
        fullName: 'Đỗ Công Danh',
        primaryDomain: 'backend',
        yearsExperience: 3,
        maxConcurrentProjects: '',
        orgRole: '',
      }),
    ]);
    assert.equal(out.ok, true);
    assert.equal(out.normalizedRows[0].orgRole, 'member');
    assert.equal(out.normalizedRows[0].firstName, 'Danh');
    assert.equal(out.normalizedRows[0].lastName, 'Đỗ Công');
    assert.equal(out.normalizedRows[0].maxConcurrentProjects, 2);
  });

  it('keeps complete past projects and skips empty blocks', () => {
    const out = validateResourceImportRows([
      baseRow({
        pastProject1Name: 'Cổng thanh toán',
        pastProject1Role: 'BE',
        pastProject1Work: 'Đối soát',
        pastProject1Year: 2024,
        pastProject2Name: '',
        pastProject2Role: '',
        pastProject2Work: '',
      }),
    ]);
    assert.equal(out.ok, true);
    assert.equal(out.normalizedRows[0].pastProjects.length, 1);
    assert.equal(out.normalizedRows[0].pastProjects[0].name, 'Cổng thanh toán');
    assert.equal(out.normalizedRows[0].pastProjects[0].year, 2024);
  });

  it('rejects past project work over 300 chars or year out of range', () => {
    const longWork = 'x'.repeat(301);
    const workTooLong = validateResourceImportRows([
      baseRow({
        pastProject1Name: 'A',
        pastProject1Role: 'BE',
        pastProject1Work: longWork,
      }),
    ]);
    assert.equal(workTooLong.ok, false);
    assert.equal(workTooLong.details?.[0]?.errorCode, 'VALIDATION_PAST_PROJECT_WORK_LENGTH');

    const badYear = validateResourceImportRows([
      baseRow({
        pastProject1Name: 'A',
        pastProject1Role: 'BE',
        pastProject1Work: 'API',
        pastProject1Year: 1800,
      }),
    ]);
    assert.equal(badYear.ok, false);
    assert.equal(badYear.details?.[0]?.errorCode, 'VALIDATION_PAST_PROJECT_YEAR');
  });
});

describe('resourceImportValidator helpers', () => {
  it('splitFullName handles single token', () => {
    const one = splitFullName('Solo');
    assert.equal(one.ok, true);
    assert.equal(one.displayName, 'Solo');
  });

  it('normalizeOptionalPhone rejects short', () => {
    assert.equal(normalizeOptionalPhone('12').ok, false);
  });

  it('normalizePrimaryDomain maps aliases', () => {
    const out = normalizePrimaryDomain('fe');
    assert.equal(out.ok, true);
  });

  it('normalizePrimaryDomain maps UI labels Frontend/Backend/Khác', () => {
    assert.equal(normalizePrimaryDomain('Frontend').value, 'fe');
    assert.equal(normalizePrimaryDomain('Backend').value, 'be');
    assert.equal(normalizePrimaryDomain('Full-stack').value, 'fullstack');
    assert.equal(normalizePrimaryDomain('Khác').value, 'other');
  });
});

describe('resourceImportValidator skills catalog', () => {
  const { SKILL_WHITELIST, normalizeSkillName } = require('../src/utils/resourceImportValidator');
  const userCat = require('../../user-service/src/constants/capabilityCatalog');

  it('mirrors user-service SKILL_WHITELIST', () => {
    assert.deepEqual([...SKILL_WHITELIST], [...userCat.SKILL_WHITELIST]);
  });

  it('accepts Frontend + Node.js, mongo and rejects unknown skill', () => {
    const ok = validateResourceImportRows([
      baseRow({ primaryDomain: 'Frontend', skills: 'Node.js, mongo, REST API' }),
    ]);
    assert.equal(ok.ok, true, JSON.stringify(ok.details || []));
    assert.equal(ok.normalizedRows[0].primaryDomain, 'fe');
    assert.deepEqual(ok.normalizedRows[0].skills, ['Node.js', 'MongoDB', 'REST API']);

    const bad = validateResourceImportRows([baseRow({ skills: 'Jira, FooLang' })]);
    assert.equal(bad.ok, false);
    assert.equal(bad.details?.[0]?.errorCode, 'VALIDATION_SKILL_NOT_IN_CATALOG');
  });

  it('rejects hire skills above HIRE_SKILLS_MAX without silent truncate', () => {
    const { HIRE_SKILLS_MAX, SKILL_WHITELIST } = require('../src/utils/resourceImportValidator');
    const ten = SKILL_WHITELIST.slice(0, HIRE_SKILLS_MAX).join(', ');
    const ok = validateResourceImportRows([baseRow({ skills: ten })]);
    assert.equal(ok.ok, true, JSON.stringify(ok.details || []));
    assert.equal(ok.normalizedRows[0].skills.length, HIRE_SKILLS_MAX);

    const eleven = SKILL_WHITELIST.slice(0, HIRE_SKILLS_MAX + 1).join(', ');
    const bad = validateResourceImportRows([baseRow({ skills: eleven })]);
    assert.equal(bad.ok, false);
    assert.equal(bad.details?.[0]?.errorCode, 'VALIDATION_SKILLS_HIRE_MAX');
  });

  it('normalizeSkillName aliases match user-service', () => {
    assert.equal(normalizeSkillName('nodejs'), userCat.normalizeSkillName('nodejs'));
    assert.equal(normalizeSkillName('k8s'), 'Kubernetes');
  });
});
