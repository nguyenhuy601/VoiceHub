const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const XLSX = require(path.join(__dirname, '..', 'node_modules', 'xlsx'));
const { parseExcelToRawRows, resolveCanonicalHeader } = require('../src/utils/excelImportParse');

function bufFromAoa(aoa) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'resource_import');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

const EN_HEADERS = [
  'employeeCode',
  'fullName',
  'email',
  'phone',
  'departmentCode',
  'jobTitle',
  'primaryDomain',
  'skills',
  'yearsExperience',
  'maxConcurrentProjects',
  'orgRole',
];

const VI_HEADERS = [
  'Mã NV (để trống)',
  'Họ tên',
  'Email',
  'SĐT',
  'Phòng ban',
  'Chức danh HR',
  'Chuyên môn',
  'Kỹ năng',
  'Số năm KN',
  'Trần số dự án (1–20)',
  'Vai trò công ty',
];

const SAMPLE = [
  '',
  'Nguyễn An',
  'an.nguyen@company.com',
  '',
  'Backend',
  'Backend Developer',
  'be',
  'Node.js',
  1,
  2,
  'member',
];

describe('excelImportParse headers', () => {
  it('maps Vietnamese and English header aliases', () => {
    assert.equal(resolveCanonicalHeader('jobTitle'), 'jobTitle');
    assert.equal(resolveCanonicalHeader('Chức danh HR'), 'jobTitle');
    assert.equal(resolveCanonicalHeader('department'), 'departmentCode');
    assert.equal(resolveCanonicalHeader('Phòng ban'), 'departmentCode');
    assert.equal(resolveCanonicalHeader('Chuyên môn'), 'primaryDomain');
    assert.equal(resolveCanonicalHeader('Vai trò công ty'), 'orgRole');
  });

  it('parses legacy English headers', () => {
    const rows = parseExcelToRawRows(bufFromAoa([EN_HEADERS, SAMPLE]));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].email, 'an.nguyen@company.com');
    assert.equal(rows[0].departmentCode, 'Backend');
    assert.equal(rows[0].jobTitle, 'Backend Developer');
    assert.equal(rows[0].primaryDomain, 'be');
    assert.equal(rows[0].orgRole, 'member');
  });

  it('parses Vietnamese display headers (file đã đổi tên cột)', () => {
    const rows = parseExcelToRawRows(bufFromAoa([VI_HEADERS, SAMPLE]));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].email, 'an.nguyen@company.com');
    assert.equal(rows[0].departmentCode, 'Backend');
    assert.equal(rows[0].jobTitle, 'Backend Developer');
    assert.equal(rows[0].primaryDomain, 'be');
    assert.equal(rows[0].maxConcurrentProjects, 2);
  });

  it('skips Vietnamese hint row under English headers', () => {
    const hints = [
      'Mã NV (để trống)',
      'Họ tên',
      'Email',
      'SĐT',
      'Phòng ban',
      'Chức danh HR',
      'Chuyên môn (fe|be|…)',
      'Kỹ năng',
      'Số năm KN',
      'Trần số dự án (1–20)',
      'Vai trò công ty',
    ];
    const rows = parseExcelToRawRows(bufFromAoa([EN_HEADERS, hints, SAMPLE]));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].email, 'an.nguyen@company.com');
    assert.equal(rows[0].rowNumber, 3);
  });

  it('parses two past-project blocks and ignores empty slots', () => {
    const { parsePastProjectBlocks } = require('../src/utils/parsePastProjectBlocks');
    const headers = [
      ...EN_HEADERS,
      'pastProject1Name',
      'pastProject1Role',
      'pastProject1Work',
      'pastProject1Year',
      'pastProject2Name',
      'pastProject2Role',
      'pastProject2Work',
      'pastProject2Year',
      'pastProject3Name',
      'pastProject3Role',
      'pastProject3Work',
      'pastProject3Year',
      'pastProject4Name',
      'pastProject4Role',
      'pastProject4Work',
      'pastProject4Year',
      'pastProject5Name',
      'pastProject5Role',
      'pastProject5Work',
      'pastProject5Year',
    ];
    const row = [
      ...SAMPLE,
      'Cổng thanh toán',
      'BE',
      'Đối soát',
      2024,
      'App nội bộ',
      'Tech lead',
      'Chia module',
      2023,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ];
    const rows = parseExcelToRawRows(bufFromAoa([headers, row]));
    assert.equal(rows.length, 1);
    const projects = parsePastProjectBlocks(rows[0]);
    assert.equal(projects.length, 2);
    assert.equal(projects[0].name, 'Cổng thanh toán');
    assert.equal(projects[1].name, 'App nội bộ');
  });

  it('accepts legacy file that still has empty employeeCode column', () => {
    const rows = parseExcelToRawRows(bufFromAoa([EN_HEADERS, SAMPLE]));
    assert.equal(rows.length, 1);
    assert.equal(String(rows[0].employeeCode || '').trim(), '');
    assert.equal(rows[0].fullName, 'Nguyễn An');
  });

  it('merges skill1…5 dropdown cells and keeps legacy skills comma column', () => {
    const { mergeSkillCells } = require('../src/utils/excelImportParse');
    assert.equal(mergeSkillCells('REST API', ['Node.js', 'MongoDB', '', '', '']), 'Node.js, MongoDB, REST API');

    const headers = [
      'fullName',
      'email',
      'phone',
      'departmentCode',
      'jobTitle',
      'primaryDomain',
      'skill1',
      'skill2',
      'skill3',
      'yearsExperience',
      'maxConcurrentProjects',
      'orgRole',
    ];
    const row = [
      'Nguyễn An',
      'an.nguyen@company.com',
      '',
      'Backend',
      'Backend Developer',
      'be',
      'Node.js',
      'MongoDB',
      '',
      1,
      2,
      'member',
    ];
    const rows = parseExcelToRawRows(bufFromAoa([headers, row]));
    assert.equal(rows.length, 1);
    assert.match(String(rows[0].skills), /Node\.js/);
    assert.match(String(rows[0].skills), /MongoDB/);
  });
});
