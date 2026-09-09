/** Nhãn hiển thị — không phải sequential key hệ thống. Mirror FE displayIssueKey. */
function displayIssueKey(projectCode, id) {
  const code =
    String(projectCode || 'VH')
      .replace(/[^A-Za-z0-9]/g, '')
      .slice(0, 8)
      .toUpperCase() || 'VH';
  const suffix =
    String(id || '')
      .replace(/[^a-fA-F0-9]/g, '')
      .slice(-4)
      .toUpperCase() || '0000';
  return `${code}-${suffix}`;
}

module.exports = { displayIssueKey };
