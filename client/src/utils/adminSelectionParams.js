/**
 * Xóa query param chọn user/role sau mutation (list + action panels).
 */
export function clearAdminUserSelection(searchParams, setSearchParams) {
  const next = new URLSearchParams(searchParams);
  if (!next.has('userId')) return;
  next.delete('userId');
  setSearchParams(next, { replace: true });
}

export function clearAdminRoleSelection(searchParams, setSearchParams) {
  const next = new URLSearchParams(searchParams);
  if (!next.has('roleId')) return;
  next.delete('roleId');
  setSearchParams(next, { replace: true });
}
