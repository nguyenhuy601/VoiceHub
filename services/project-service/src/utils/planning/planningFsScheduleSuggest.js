function ymd(value) {
  const match = String(value || '').trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

/**
 * Finish-to-Start trong file import. Không đọc DB, không bịa ngày gợi ý.
 * Việc sau (toKey) bắt đầu trước Due Date việc trước (fromKey) → revise startDate, suggestedValue rỗng.
 */
function suggestFsPredecessorRevisions(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const wbsByKey = new Map();
  for (const row of list) {
    if (String(row?.kind || '').toUpperCase() !== 'WBS') continue;
    const key = String(row.externalKey || '').trim();
    if (key) wbsByKey.set(key, row);
  }
  const out = [];
  for (const row of list) {
    if (String(row?.kind || '').toUpperCase() !== 'DEPENDENCY') continue;
    const structured = row.structured || {};
    const dependencyType = String(structured.dependencyType || '').trim().toUpperCase();
    if (dependencyType && dependencyType !== 'FS') continue;
    const predecessor = wbsByKey.get(String(structured.fromKey || '').trim());
    const successor = wbsByKey.get(String(structured.toKey || '').trim());
    if (!predecessor || !successor) continue;
    const predecessorDue = ymd(predecessor.structured?.endDate);
    const successorStart = ymd(successor.structured?.startDate);
    if (!predecessorDue || !successorStart) continue;
    if (successorStart >= predecessorDue) continue;
    const externalKey = String(successor.externalKey || '').trim();
    out.push({
      kind: 'WBS',
      externalKey,
      sheet: successor._sheet || 'WBS',
      row: successor._row || 0,
      field: 'startDate',
      excelValue: successorStart,
      verdict: 'revise',
      suggestedValue: '',
      basis: 'fs_predecessor',
      assignee: null,
      subjectKey: externalKey,
    });
  }
  return out;
}

module.exports = {
  suggestFsPredecessorRevisions,
};
