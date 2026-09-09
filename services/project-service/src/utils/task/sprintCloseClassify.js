function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function isDoneListTitle(titleOrStatus) {
  const n = normalizeText(titleOrStatus);
  if (!n) return false;
  if (['xong', 'done', 'completed', 'hoan thanh'].includes(n)) return true;
  return n.endsWith(' xong') || n.startsWith('done');
}

function isDoneFromTask(task, listMeta) {
  if (String(task?.status || '') === 'done') return true;
  if (!listMeta) return false;
  const statusKey = listMeta?.statusKey ?? '';
  const title = listMeta?.title ?? '';
  if (isDoneListTitle(statusKey) || isDoneListTitle(title)) return true;

  // Heuristic rộng hơn theo bucket classifyListStatusBucket ở FE (done/complete).
  const s = normalizeText(String(statusKey || title || ''));
  return s.includes('done') || s.includes('complete');
}

function normalizeEstimateHours(hours) {
  const n = Number(hours);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function classifySprintClosureTasks({ tasks = [], listsById = {} } = {}) {
  const doneTaskIds = [];
  const incompleteTaskIds = [];
  let committedHours = 0;
  let completedHours = 0;

  for (const task of tasks || []) {
    const taskId = String(task?._id || task?.id || '').trim();
    if (!taskId) continue;
    const listId = task?.listId ? String(task.listId) : '';
    const listMeta = listsById && listId ? listsById[listId] : null;

    const estimateHours = normalizeEstimateHours(task?.estimateHours);
    committedHours += estimateHours;

    const isDone = isDoneFromTask(task, listMeta);
    if (isDone) {
      doneTaskIds.push(taskId);
      completedHours += estimateHours;
    } else {
      incompleteTaskIds.push(taskId);
    }
  }

  const incompleteHours = committedHours - completedHours;

  return {
    doneTaskIds,
    incompleteTaskIds,
    doneCount: doneTaskIds.length,
    incompleteCount: incompleteTaskIds.length,
    committedHours,
    completedHours,
    incompleteHours,
  };
}

module.exports = {
  normalizeText,
  isDoneListTitle,
  isDoneFromTask,
  normalizeEstimateHours,
  classifySprintClosureTasks,
};

