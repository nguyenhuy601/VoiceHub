function numOrZero(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

const OVERDUE_ITEMS_LIMIT = 8;

function mergeOverdueItems(rows) {
  const items = [];
  (Array.isArray(rows) ? rows : []).forEach((stats) => {
    const oid = stats?.organizationId ? String(stats.organizationId) : '';
    (Array.isArray(stats?.overdueItems) ? stats.overdueItems : []).forEach((item) => {
      const id = item?.id || item?._id;
      if (!id) return;
      items.push({
        id: String(id),
        title: String(item.title || id),
        dueDate: item.dueDate || null,
        boardId: item.boardId ? String(item.boardId) : '',
        boardName: String(item.boardName || ''),
        assigneeId: item.assigneeId ? String(item.assigneeId) : null,
        organizationId: String(item.organizationId || oid),
      });
    });
  });
  items.sort((a, b) => {
    const ta = a.dueDate ? Date.parse(a.dueDate) : Number.POSITIVE_INFINITY;
    const tb = b.dueDate ? Date.parse(b.dueDate) : Number.POSITIVE_INFINITY;
    return ta - tb;
  });
  return items.slice(0, OVERDUE_ITEMS_LIMIT);
}

function mergeOrgDashboardStats(perOrg) {
  const rows = Array.isArray(perOrg) ? perOrg.filter(Boolean) : [];
  if (!rows.length) {
    return {
      taskDone: null,
      openCount: 0,
      overdue: 0,
      dueThisWeek: 0,
      myOpen: 0,
      myOverdue: 0,
      myDueThisWeek: 0,
      boards: [],
      overdueItems: [],
      membershipRole: null,
      failed: true,
    };
  }

  let taskDone = 0;
  let openCount = 0;
  let overdue = 0;
  let dueThisWeek = 0;
  let myOpen = 0;
  let myOverdue = 0;
  let myDueThisWeek = 0;
  const boards = [];
  let membershipRole = null;

  rows.forEach((stats) => {
    taskDone += numOrZero(stats.done);
    openCount += numOrZero(stats.openCount);
    overdue += numOrZero(stats.overdue);
    dueThisWeek += numOrZero(stats.dueThisWeek);
    myOpen += numOrZero(stats.myOpen);
    myOverdue += numOrZero(stats.myOverdue);
    myDueThisWeek += numOrZero(stats.myDueThisWeek);
    if (!membershipRole && stats.membershipRole) {
      membershipRole = String(stats.membershipRole);
    }
    if (Array.isArray(stats.boards)) {
      stats.boards.forEach((b) => {
        if (!b?.id) return;
        boards.push({
          id: String(b.id),
          name: String(b.name || b.id),
          organizationId: stats.organizationId ? String(stats.organizationId) : '',
          total: numOrZero(b.total),
          done: numOrZero(b.done),
          open: numOrZero(b.open),
          overdue: numOrZero(b.overdue),
        });
      });
    }
  });

  boards.sort((a, b) => b.overdue - a.overdue || b.open - a.open);
  return {
    taskDone,
    openCount,
    overdue,
    dueThisWeek,
    myOpen,
    myOverdue,
    myDueThisWeek,
    boards: boards.slice(0, 5),
    overdueItems: mergeOverdueItems(rows),
    membershipRole,
    failed: false,
  };
}

module.exports = { mergeOrgDashboardStats, mergeOverdueItems, numOrZero, OVERDUE_ITEMS_LIMIT };
