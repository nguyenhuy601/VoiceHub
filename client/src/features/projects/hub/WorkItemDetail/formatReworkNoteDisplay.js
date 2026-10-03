/**
 * Parse qaReworkNote into a clean bug title for Overview — never show raw
 * legacy dumps like «QA mở bug → … | Đã mở bug: …».
 * @param {unknown} raw
 * @returns {{ bugTitle: string }}
 */
export function formatReworkNoteDisplay(raw) {
  const text = String(raw || '').trim();
  if (!text) return { bugTitle: '' };

  let bugTitle = '';
  const bracket = text.match(/\[Bug\]\s*([^|·→\n]+)/i);
  if (bracket) {
    bugTitle = String(bracket[1] || '').trim();
  } else {
    const afterBugColon = text.match(/\bBug:\s*([^|·\n]+)/i);
    if (afterBugColon) {
      bugTitle = String(afterBugColon[1] || '').trim();
    } else {
      const afterOpen = text.match(/QA mở bug\s*[·:]\s*(.+)$/i);
      if (afterOpen) {
        bugTitle = String(afterOpen[1] || '')
          .replace(/\s*[|·].*$/, '')
          .trim();
      } else {
        const afterFail = text.match(/QA Fail\s*[·—-]\s*(.+)$/i);
        if (afterFail) {
          bugTitle = String(afterFail[1] || '')
            .replace(/\s*[|·].*$/, '')
            .trim();
        }
      }
    }
  }

  bugTitle = bugTitle
    .replace(/^\[Bug\]\s*/i, '')
    .replace(/\s*[|].*$/, '')
    .replace(/\s*·\s*Đã mở bug:.*$/i, '')
    .trim()
    .slice(0, 120);

  return { bugTitle };
}
