import { useEffect } from 'react';
import { useSocket } from '../../context/SocketContext';
import { useCompanyAdminContext } from '../../pages/Admin/CompanyAdminLayout';
import {
  invalidateAdminMembers,
  removeAdminMember,
} from '../../stores/adminMembersStore';
import { invalidateAdminRoles } from '../../stores/adminRolesStore';

function payloadOrgId(payload) {
  return String(payload?.organizationId || payload?.orgId || '').trim();
}

function payloadUserId(payload) {
  return String(payload?.userId || '').trim();
}

/**
 * Đồng bộ danh sách admin khi member/role thay đổi qua socket (admin khác hoặc tab khác).
 */
export default function AdminCompanyRealtimeSync() {
  const { on, off } = useSocket();
  const { orgId, refreshStats } = useCompanyAdminContext();

  useEffect(() => {
    if (!orgId) return undefined;

    const matchesOrg = (payload) => payloadOrgId(payload) === orgId;

    const handleMemberJoined = (payload) => {
      if (!matchesOrg(payload)) return;
      invalidateAdminMembers(orgId);
      refreshStats?.();
    };

    const handleMemberRemoved = (payload) => {
      if (!matchesOrg(payload)) return;
      const uid = payloadUserId(payload);
      if (uid) removeAdminMember(orgId, uid);
      invalidateAdminMembers(orgId);
      refreshStats?.();
    };

    const handleMemberRoleUpdated = (payload) => {
      if (!matchesOrg(payload)) return;
      invalidateAdminMembers(orgId);
    };

    const handleOrgShellUpdated = (payload) => {
      if (payload?.organizationId && payloadOrgId(payload) !== orgId) return;
      invalidateAdminMembers(orgId);
      refreshStats?.();
    };

    const handleRoleChanged = () => {
      invalidateAdminRoles(orgId);
    };

    on('organization:member_joined', handleMemberJoined);
    on('organization:member_removed', handleMemberRemoved);
    on('organization:member_role_updated', handleMemberRoleUpdated);
    on('org:shell:updated', handleOrgShellUpdated);
    on('organization:role_updated', handleRoleChanged);

    return () => {
      off('organization:member_joined', handleMemberJoined);
      off('organization:member_removed', handleMemberRemoved);
      off('organization:member_role_updated', handleMemberRoleUpdated);
      off('org:shell:updated', handleOrgShellUpdated);
      off('organization:role_updated', handleRoleChanged);
    };
  }, [on, off, orgId, refreshStats]);

  return null;
}
