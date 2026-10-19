/** Vai trò dự án của user đang xem. null = payload chưa có capabilities. */
export function readViewerProjectRoleKeys(projectRow) {
  const raw =
    projectRow?.capabilities?.viewerProjectRoleKeys ?? projectRow?.viewerProjectRoleKeys;
  if (!Array.isArray(raw)) return null;
  return raw.map((key) => String(key || '').trim()).filter(Boolean);
}

export function lacksProjectRole(projectRow) {
  const keys = readViewerProjectRoleKeys(projectRow);
  return Array.isArray(keys) && keys.length === 0;
}

export function isProjectAccessDeniedError(error) {
  const status = Number(error?.status || error?.response?.status || error?.statusCode || 0);
  return status === 403 || status === 404;
}

/** Chặn vào workspace khi không có vai trò, hoặc API từ chối đọc dự án. */
export function shouldDenyProjectEntry({ projectRow, isError, error } = {}) {
  if (isError && isProjectAccessDeniedError(error)) return true;
  if (projectRow && lacksProjectRole(projectRow)) return true;
  return false;
}
