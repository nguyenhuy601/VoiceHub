/**
 * Detect OT soft warning from task-service PUT project-members roles (409).
 */
export function isOtSoftWarning(errorLike) {
  const data = errorLike?.data || errorLike?.response?.data || {};
  const code = String(data?.errorCode || data?.code || '').trim();
  const status = errorLike?.status || errorLike?.response?.status || null;
  return code === 'OT_SOFT_WARNING' || (status === 409 && code.includes('OT_SOFT'));
}

export function readOtSoftWarningMeta(errorLike) {
  const data = errorLike?.data || errorLike?.response?.data || {};
  const current =
    data?.currentActiveProjects ?? data?.extra?.currentActiveProjects ?? data?.currentActiveCount ?? null;
  const max = data?.maxConfigured ?? data?.extra?.maxConfigured ?? null;
  return {
    currentActiveProjects: current == null ? null : Number(current),
    maxConfigured: max == null ? null : Number(max),
    message: data?.messageUser || data?.message || '',
  };
}
