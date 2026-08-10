/**
 * Heuristic AI drafts (P2 / P2.5) — human review trước khi confirm.
 * Không phụ thuộc LLM để UAT ổn định; có thể thay bằng worker sau.
 */

const STATUS_LISTS_VI = ['Chưa làm', 'Đang làm', 'Chờ duyệt', 'Xong'];

function slugCode(title) {
  const raw = String(title || 'PRJ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toUpperCase()
    .slice(0, 24);
  const stamp = String(Date.now()).slice(-4);
  return `${raw || 'PRJ'}-${stamp}`.slice(0, 32);
}

function buildProjectDraft({
  brief = '',
  title = '',
  projectCode = '',
  description = '',
  dueDate = null,
  teams = [],
  visibility = 'workspace',
}) {
  const briefText = String(brief || '').trim();
  const resolvedTitle =
    String(title || '').trim() ||
    (briefText ? briefText.split(/[.\n]/)[0].trim().slice(0, 120) : 'Dự án mới');
  const teamLists = (Array.isArray(teams) ? teams : [])
    .map((t) => {
      const name = String(t?.name || t?.title || '').trim();
      if (!name) return null;
      return {
        title: name.startsWith('Team ') ? name : `Team ${name}`,
        teamId: t?._id || t?.id || null,
      };
    })
    .filter(Boolean);

  const lists = [
    ...STATUS_LISTS_VI.map((t) => ({ title: t, kind: 'status' })),
    ...teamLists.map((t) => ({ ...t, kind: 'team' })),
  ];

  return {
    title: resolvedTitle,
    projectCode: String(projectCode || '').trim() || slugCode(resolvedTitle),
    description: String(description || briefText || '').trim().slice(0, 2000),
    dueDate: dueDate || null,
    visibility: visibility === 'private' ? 'private' : 'workspace',
    lists,
    brief: briefText,
  };
}

/**
 * Suy Responsibility key từ tên list / brief — khớp Excel primaryDomain → soft-assign.
 * Rỗng = không đoán (AI không bịa chuyên môn).
 */
function inferResponsibilityKeyFromText(raw) {
  const t = String(raw || '')
    .trim()
    .toLowerCase();
  if (!t) return '';
  if (/\b(backend|back-end|\bbe\b)\b/.test(t)) return 'backend';
  if (/\b(frontend|front-end|\bfe\b)\b/.test(t)) return 'frontend';
  if (/\b(devops|sre|kubernetes)\b/.test(t)) return 'devops';
  if (/\b(qa|tester|kiểm thử)\b/.test(t)) return 'qa';
  if (/\b(design|ui\/ux|\bux\b|\bui\b)\b/.test(t)) return 'design';
  if (/\b(architect|architecture)\b/.test(t)) return 'architecture';
  if (/\b(product|\bba\b|business analyst|scrum|\bpo\b)\b/.test(t)) return 'product';
  return '';
}

function buildTeamAssignSuggestions({
  listTitle = '',
  boardTitle = '',
  prompt = '',
  members = [],
  maxCards = 5,
}) {
  const text = String(prompt || '').trim();
  const teamLabel = String(listTitle || 'Team').replace(/^Team\s+/i, '').trim() || 'Team';
  const base = String(boardTitle || 'dự án').trim();
  const lines = text
    ? text
        .split(/\n|•|- /)
        .map((s) => s.trim())
        .filter((s) => s.length >= 4)
        .slice(0, maxCards)
    : [];

  const defaults = [
    `Phân tích yêu cầu — ${teamLabel}`,
    `Triển khai phần ${teamLabel} cho ${base}`,
    `Kiểm thử / review — ${teamLabel}`,
    `Bàn giao & tài liệu — ${teamLabel}`,
    `Hỗ trợ go-live — ${teamLabel}`,
  ];

  const titles = lines.length ? lines : defaults.slice(0, Math.min(maxCards, 4));
  const memberPool = (Array.isArray(members) ? members : []).filter((m) => m?.userId);
  const preferred = memberPool.filter((m) => m.suggested === true);
  const pool = preferred.length ? preferred : memberPool;

  return titles.map((title, idx) => {
    const m = pool.length ? pool[idx % pool.length] : null;
    const due = new Date();
    due.setDate(due.getDate() + 7 + idx * 2);
    return {
      title: String(title).slice(0, 180),
      summary: `Gợi ý AI cho ${teamLabel}`,
      description: text ? `Từ brief/prompt:\n${text.slice(0, 500)}` : '',
      priority: idx === 0 ? 'high' : 'medium',
      dueDate: due.toISOString(),
      assigneeId: m ? String(m.userId) : null,
      assigneeName: m?.displayName || m?.username || '',
    };
  });
}

module.exports = {
  STATUS_LISTS_VI,
  buildProjectDraft,
  buildTeamAssignSuggestions,
  inferResponsibilityKeyFromText,
};
