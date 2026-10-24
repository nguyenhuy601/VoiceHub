import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { organizationAPI } from '../../../../services/api/organizationAPI';
import { projectAPI } from '../../../../services/api/projectAPI';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

function memberRows(raw) {
  if (Array.isArray(raw?.members)) return raw.members;
  if (Array.isArray(raw)) return raw;
  return [];
}

/** Bỏ nhãn trùng userId — đó là mã, không phải tên nhân viên. */
export function isRawUserIdLabel(label, userId) {
  const text = String(label || '').trim();
  if (!text) return false;
  const id = String(userId || '').trim();
  if (id && text === id) return true;
  return /^[a-f0-9]{24}$/i.test(text);
}

function memberName(row) {
  const nested = row?.user && typeof row.user === 'object' ? row.user : null;
  const profile = row?.profile && typeof row.profile === 'object' ? row.profile : null;
  const id = String(
    row?.userId || nested?._id || nested?.id || profile?._id || profile?.id || ''
  ).trim();
  if (!id) return null;
  const name = String(
    row?.displayName ||
      row?.fullName ||
      nested?.displayName ||
      nested?.fullName ||
      profile?.displayName ||
      profile?.fullName ||
      [row?.lastName, row?.firstName].filter(Boolean).join(' ') ||
      [nested?.lastName, nested?.firstName].filter(Boolean).join(' ') ||
      row?.username ||
      nested?.username ||
      ''
  ).trim();
  if (!name || isRawUserIdLabel(name, id)) return null;
  return { id, name };
}

function mapMemberNames(raw) {
  const map = {};
  for (const row of memberRows(raw)) {
    const parsed = memberName(row);
    if (parsed) map[parsed.id] = parsed.name;
  }
  return map;
}

/**
 * userId → tên nhân viên.
 * Thành viên dự án ghi đè danh bạ tổ chức khi cả hai có tên.
 * @param {string} projectId
 * @param {string} [organizationId] danh bạ org — người được gán có thể chưa vào dự án
 */
export function useProjectMemberNames(projectId, organizationId) {
  const projectQuery = useQuery({
    queryKey: ['projectMemberNames', String(projectId || '')],
    queryFn: async () => {
      const raw = unwrap(
        await projectAPI.listMembers(projectId, { skipPermissionDeniedToast: true })
      );
      return mapMemberNames(raw);
    },
    enabled: Boolean(projectId),
    staleTime: 60_000,
    retry: false,
  });

  const orgQuery = useQuery({
    queryKey: ['orgMemberNames', String(organizationId || '')],
    queryFn: async () => {
      const raw = unwrap(await organizationAPI.getMembers(organizationId));
      return mapMemberNames(raw);
    },
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    retry: false,
  });

  return useMemo(
    () => ({ ...(orgQuery.data || {}), ...(projectQuery.data || {}) }),
    [orgQuery.data, projectQuery.data]
  );
}
