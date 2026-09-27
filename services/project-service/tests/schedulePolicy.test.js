const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  isWarnV1,
  omitClientSchedulePolicy,
  collectDateWarnings,
  collectCardDateWarnings,
  dateWarningsForProject,
  attachScheduleWarnings,
} = require('../src/utils/project/schedulePolicy');

const TODAY = '2026-09-26';

describe('schedulePolicy', () => {
  it('chỉ warn_v1 là bật luật', () => {
    assert.equal(isWarnV1({ schedulePolicy: 'warn_v1' }), true);
    assert.equal(isWarnV1({ schedulePolicy: null }), false);
    assert.equal(isWarnV1({}), false);
    assert.equal(isWarnV1({ schedulePolicy: 'other' }), false);
  });

  it('xóa schedulePolicy do client gửi', () => {
    const body = { title: 'A', schedulePolicy: 'warn_v1' };
    omitClientSchedulePolicy(body);
    assert.equal(Object.prototype.hasOwnProperty.call(body, 'schedulePolicy'), false);
    assert.equal(body.title, 'A');
  });

  it('warn_v1 ngày quá khứ → date_before_today', () => {
    const rows = collectDateWarnings({
      startDate: '2026-09-01',
      endDate: '2026-10-01',
      todayYmd: TODAY,
      subjectKey: 'p1',
    });
    assert.deepEqual(rows, [
      {
        code: 'date_before_today',
        field: 'startDate',
        subjectKey: 'p1',
        message: 'Date before today',
      },
    ]);
  });

  it('cờ null + cùng ngày quá khứ → mảng rỗng', () => {
    const rows = dateWarningsForProject(
      { schedulePolicy: null },
      { startDate: '2026-09-01', todayYmd: TODAY, subjectKey: 'old' }
    );
    assert.deepEqual(rows, []);
  });

  it('start sau end', () => {
    const rows = collectDateWarnings({
      startDate: '2026-10-10',
      endDate: '2026-10-01',
      todayYmd: TODAY,
    });
    assert.equal(rows.some((row) => row.code === 'start_after_end'), true);
    assert.equal(rows.find((row) => row.code === 'start_after_end').message, 'Start after end');
  });

  it('chỉ một ngày thì không start_after_end', () => {
    const rows = collectDateWarnings({
      startDate: '2026-10-10',
      todayYmd: TODAY,
    });
    assert.equal(rows.some((row) => row.code === 'start_after_end'), false);
  });

  it('thẻ có giờ và assignee, start sau due: không warning mềm start_after_end', () => {
    const rows = collectCardDateWarnings({
      assigneeId: 'u1',
      estimateHours: 8,
      startDate: '2026-10-10',
      dueDate: '2026-10-01',
      todayYmd: TODAY,
      subjectKey: 'card1',
    });
    assert.equal(rows.some((row) => row.code === 'start_after_end'), false);
  });

  it('thẻ không giờ, start sau due → warning, không ghi vào document', () => {
    const rows = collectCardDateWarnings({
      assigneeId: null,
      estimateHours: 0,
      startDate: '2026-10-10',
      dueDate: '2026-10-01',
      todayYmd: TODAY,
      subjectKey: 'card2',
    });
    assert.equal(rows.filter((row) => row.code === 'start_after_end').length, 1);
    const taskDoc = { _id: 'card2', startDate: '2026-10-10', dueDate: '2026-10-01' };
    const json = attachScheduleWarnings(taskDoc, rows);
    assert.equal(Object.prototype.hasOwnProperty.call(taskDoc, 'scheduleWarnings'), false);
    assert.ok(json.scheduleWarnings.length > 0);
  });

  it('không có warning thì omit mảng', () => {
    const doc = { _id: 'p' };
    assert.equal(attachScheduleWarnings(doc, []), doc);
  });
});
