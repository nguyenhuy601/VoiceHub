/**
 * Sheet 01_FieldGuide — which Planning columns the PM fills and which the import may suggest.
 * Cell comments are not used: xlsx community does not persist them.
 */

const { SUGGESTION_HEADER_MARK, stripSuggestionMark } = require('../../constants/planningWorkbookAliases');

const FIELD_GUIDE_SHEET = '01_FieldGuide';

const FIELD_GUIDE_HEADERS = Object.freeze([
  'Sheet',
  'Column',
  'PM action',
  'System suggests',
  'Basis',
]);

function basis(vi, en) {
  return `VI: ${vi} EN: ${en}`;
}

const FIELD_GUIDE_ROWS = Object.freeze([
  {
    Sheet: 'WBS',
    Column: 'Role Key',
    'PM action': 'Fill',
    'System suggests': 'No',
    Basis: basis(
      'Điền. Không gợi ý. Phải trùng Role Key trên RESOURCE_ROLES. Không có thì không gợi ý người.',
      'Fill. Not suggested. Must match a Role Key on RESOURCE_ROLES. Without it, no assignee suggestion.'
    ),
  },
  {
    Sheet: 'WBS',
    Column: 'Estimate Hours',
    'PM action': 'Fill',
    'System suggests': 'No',
    Basis: basis(
      'Điền. Không gợi ý. Để trống thì không tính Due Date và không xếp người.',
      'Fill. Not suggested. If blank, Due Date and assignee are not suggested.'
    ),
  },
  {
    Sheet: 'WBS',
    Column: 'Start Date',
    'PM action': 'Fill',
    'System suggests': 'No',
    Basis: basis('Điền. Không gợi ý.', 'Fill. Not suggested.'),
  },
  {
    Sheet: 'WBS',
    Column: 'Due Date',
    'PM action': 'Leave blank',
    'System suggests': 'Yes',
    Basis: basis(
      'Để trống để gợi ý, hoặc điền. Ngày làm việc = làm tròn lên (giờ/8), bỏ thứ Bảy và Chủ nhật, không trừ ngày nghỉ tổ chức. Điền đúng hoặc muộn hơn thì giữ. Điền sớm hơn thì gợi ý sửa.',
      'Leave blank for a suggestion, or fill. Working days = ceil(hours/8), skip Saturday and Sunday, organization holidays are not removed. On time or later is kept. Earlier gets a revision suggestion.'
    ),
  },
  {
    Sheet: 'WBS',
    Column: 'Assignee Email (Gợi ý)',
    'PM action': 'Leave blank',
    'System suggests': 'Yes',
    Basis: basis(
      'Để trống để gợi ý, hoặc điền email member. Cùng role, điểm position / CV verified / prior role, rồi người còn đủ giờ (rule B). Email không có trong org hoặc thiếu giờ thì gợi ý người khác, không tự thay.',
      'Leave blank for a suggestion, or enter a member email. Same role, then position / CV verified / prior role score, then the person with enough remaining hours (rule B). Unknown email or not enough hours suggests someone else and does not replace automatically.'
    ),
  },
  {
    Sheet: 'WBS',
    Column: 'Assignee Name (Gợi ý)',
    'PM action': 'Leave blank',
    'System suggests': 'Yes',
    Basis: basis(
      'Cùng một gợi ý với Assignee Email. Để trống để gợi ý, hoặc điền. Không tách thành hai quyết định khi import.',
      'Same suggestion as Assignee Email. Leave blank for a suggestion, or fill. Import uses one decision for both columns.'
    ),
  },
  {
    Sheet: 'WBS',
    Column: 'Key',
    'PM action': 'Fill',
    'System suggests': 'No',
    Basis: basis('Điền hoặc giữ từ seed. Không gợi ý.', 'Fill or keep the seed value. Not suggested.'),
  },
  {
    Sheet: 'WBS',
    Column: 'Title',
    'PM action': 'Fill',
    'System suggests': 'No',
    Basis: basis('Điền hoặc giữ từ seed. Không gợi ý.', 'Fill or keep the seed value. Not suggested.'),
  },
  {
    Sheet: 'WBS',
    Column: 'Description',
    'PM action': 'Fill',
    'System suggests': 'No',
    Basis: basis('Điền hoặc giữ từ seed. Không gợi ý.', 'Fill or keep the seed value. Not suggested.'),
  },
  {
    Sheet: 'WBS',
    Column: 'Parent Key',
    'PM action': 'Fill',
    'System suggests': 'No',
    Basis: basis('Điền hoặc giữ từ seed. Không gợi ý.', 'Fill or keep the seed value. Not suggested.'),
  },
  {
    Sheet: 'WBS',
    Column: 'Source FR Key',
    'PM action': 'Fill',
    'System suggests': 'No',
    Basis: basis('Điền hoặc giữ từ seed. Không gợi ý.', 'Fill or keep the seed value. Not suggested.'),
  },
  {
    Sheet: 'SCHEDULE',
    Column: 'Start Date / Due Date',
    'PM action': 'Fill',
    'System suggests': 'No',
    Basis: basis('PM điền. Không gợi ý ở lần import này.', 'PM fills these. Not suggested on this import.'),
  },
  {
    Sheet: 'MILESTONE',
    Column: 'Target Date',
    'PM action': 'Fill',
    'System suggests': 'No',
    Basis: basis('PM điền. Không gợi ý ở lần import này.', 'PM fills these. Not suggested on this import.'),
  },
  {
    Sheet: 'RELEASE',
    Column: 'Target Date / Start Date / Due Date',
    'PM action': 'Fill',
    'System suggests': 'No',
    Basis: basis('PM điền. Không gợi ý ở lần import này.', 'PM fills these. Not suggested on this import.'),
  },
  {
    Sheet: 'RISK',
    Column: 'Impact / Probability',
    'PM action': 'Fill',
    'System suggests': 'No',
    Basis: basis('PM điền. Không gợi ý ở lần import này.', 'PM fills these. Not suggested on this import.'),
  },
  {
    Sheet: 'ARCHITECTURE',
    Column: 'Body / Tech Stack',
    'PM action': 'Fill',
    'System suggests': 'No',
    Basis: basis('PM điền. Không gợi ý ở lần import này.', 'PM fills these. Not suggested on this import.'),
  },
  {
    Sheet: 'DEPENDENCY',
    Column: 'From Key / To Key',
    'PM action': 'Fill',
    'System suggests': 'No',
    Basis: basis('PM điền. Không gợi ý ở lần import này.', 'PM fills these. Not suggested on this import.'),
  },
]);

function fieldGuideAoa() {
  return [
    [...FIELD_GUIDE_HEADERS],
    ...FIELD_GUIDE_ROWS.map((row) => FIELD_GUIDE_HEADERS.map((header) => row[header])),
  ];
}

/**
 * Sheet header for a display name. Suggestion columns keep the FieldGuide mark.
 * Other sheets that reuse the same display name (Due Date on SCHEDULE) stay unmarked.
 */
function labelSuggestedHeader(sheet, displayHeader) {
  const base = stripSuggestionMark(displayHeader);
  const suggested = FIELD_GUIDE_ROWS.some(
    (row) =>
      row.Sheet === sheet &&
      row['System suggests'] === 'Yes' &&
      stripSuggestionMark(row.Column) === base
  );
  if (!suggested || !base) return base;
  return `${base} ${SUGGESTION_HEADER_MARK}`;
}

module.exports = {
  FIELD_GUIDE_SHEET,
  FIELD_GUIDE_HEADERS,
  FIELD_GUIDE_ROWS,
  fieldGuideAoa,
  labelSuggestedHeader,
};
