import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  sanitizeDepartmentDescription,
  uniqueDepartmentsForHub,
  uniqueTeamsForHub,
} from './orgDepartmentHubUtils.js';

describe('sanitizeDepartmentDescription', () => {
  it('giữ mô tả nghiệp vụ thường', () => {
    assert.equal(
      sanitizeDepartmentDescription('Tuyển dụng, tiếp nhận nhân viên mới.'),
      'Tuyển dụng, tiếp nhận nhân viên mới.'
    );
  });

  it('ẩn mô tả seed/demo nội bộ', () => {
    assert.equal(
      sanitizeDepartmentDescription('Kinh doanh / Sale — cấu trúc DN (không deep-demo board)'),
      ''
    );
    assert.equal(sanitizeDepartmentDescription('Giao hàng kỹ thuật — demo chính Dev/QA'), '');
  });
});

describe('uniqueDepartmentsForHub', () => {
  it('bỏ synthetic và trùng _id', () => {
    const list = uniqueDepartmentsForHub([
      { _id: 'a', name: 'Phòng A', division: 'div1', description: 'ok' },
      { _id: 'a', name: 'Phòng A copy', division: 'div1' },
      { _id: 'synth', name: 'X', isSynthetic: true },
      { _id: 'b', name: 'Phòng B', division: 'div1' },
    ]);
    assert.equal(list.length, 2);
    assert.equal(list[0]._id, 'a');
    assert.equal(list[1]._id, 'b');
  });

  it('gộp clone cùng tên trong cùng khối dù khác mô tả', () => {
    const list = uniqueDepartmentsForHub([
      {
        _id: '1',
        name: 'Phòng Nhân sự',
        division: 'div1',
        description: 'Mô tả ngắn',
        members: [],
      },
      {
        _id: '2',
        name: 'Phòng Nhân sự',
        division: 'div1',
        description: 'Mô tả dài khác',
        members: ['u1'],
      },
    ]);
    assert.equal(list.length, 1);
    assert.equal(list[0]._id, '2');
  });

  it('giữ cùng tên ở khối khác nhau', () => {
    const list = uniqueDepartmentsForHub([
      { _id: '1', name: 'Phòng Nhân sự', division: 'div1' },
      { _id: '2', name: 'Phòng Nhân sự', division: 'div2' },
    ]);
    assert.equal(list.length, 2);
  });
});

describe('uniqueTeamsForHub', () => {
  it('gộp clone cùng tên trong cùng phòng', () => {
    const list = uniqueTeamsForHub([
      { _id: 't1', name: 'Team QA', department: 'd1', members: [] },
      { _id: 't2', name: 'Team QA', department: 'd1', members: ['u1'] },
      { _id: 't3', name: 'Team Dev', department: 'd1' },
    ]);
    assert.equal(list.length, 2);
    assert.equal(list.find((t) => t.name === 'Team QA')._id, 't2');
  });

  it('giữ cùng tên team ở phòng khác', () => {
    const list = uniqueTeamsForHub([
      { _id: 't1', name: 'Team QA', department: 'd1' },
      { _id: 't2', name: 'Team QA', department: 'd2' },
    ]);
    assert.equal(list.length, 2);
  });
});
