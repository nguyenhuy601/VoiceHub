/**
 * A3 strangler flags — Task ownership cutover (không đổi default runtime).
 *
 * TASK_SERVICE_STRANGLER_MODE:
 *   off        — mọi Task API vẫn trên PROJECT_SERVICE_URL / fallback (default)
 *   shadow     — ghi/đọc song song khi publisher bật (phase sau)
 *   dual_write — dual-write project + task-service
 *   cutover    — Task traffic chỉ task-service (TASK_SERVICE_URL bắt buộc riêng)
 */

const MODES = new Set(['off', 'shadow', 'dual_write', 'cutover']);

function getTaskServiceStranglerMode() {
  const raw = String(process.env.TASK_SERVICE_STRANGLER_MODE || 'off')
    .trim()
    .toLowerCase();
  if (MODES.has(raw)) return raw;
  return 'off';
}

function isTaskServiceCutover() {
  return getTaskServiceStranglerMode() === 'cutover';
}

function isTaskServiceDualWrite() {
  const m = getTaskServiceStranglerMode();
  return m === 'dual_write' || m === 'shadow';
}

/**
 * Resolve URL proxy Task: ưu tiên TASK_SERVICE_URL khi set; không thì PROJECT.
 * @param {{ projectServiceUrl?: string, taskServiceUrl?: string }} urls
 */
function resolveTaskProxyUrl(urls = {}) {
  const task = String(urls.taskServiceUrl || process.env.TASK_SERVICE_URL || '')
    .trim()
    .replace(/\/+$/, '');
  const project = String(urls.projectServiceUrl || process.env.PROJECT_SERVICE_URL || '')
    .trim()
    .replace(/\/+$/, '');
  if (task) return task;
  return project;
}

/**
 * Resolve URL proxy Project meta (không dùng Task URL trừ khi thiếu PROJECT).
 */
function resolveProjectProxyUrl(urls = {}) {
  const project = String(urls.projectServiceUrl || process.env.PROJECT_SERVICE_URL || '')
    .trim()
    .replace(/\/+$/, '');
  const task = String(urls.taskServiceUrl || process.env.TASK_SERVICE_URL || '')
    .trim()
    .replace(/\/+$/, '');
  if (project) return project;
  return task;
}

module.exports = {
  TASK_STRANGLER_MODES: MODES,
  getTaskServiceStranglerMode,
  isTaskServiceCutover,
  isTaskServiceDualWrite,
  resolveTaskProxyUrl,
  resolveProjectProxyUrl,
};
