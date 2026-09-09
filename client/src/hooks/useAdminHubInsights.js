import { useMemo } from 'react';
import { useAppStrings } from '../locales/appStrings';
import useAdminMembers from './useAdminMembers';
import {
  memberNeedsOnboardingAssignment,
  memberUserId,
} from '../utils/adminUserUtils';

export default function useAdminHubInsights(orgId) {
  const { t } = useAppStrings();
  const { members, loading: membersLoading } = useAdminMembers(orgId, { view: 'admin_table' });

  const rbacByUser = useMemo(() => {
    const map = {};
    for (const member of members) {
      const uid = memberUserId(member);
      if (uid) map[uid] = Array.isArray(member.rbacRoles) ? member.rbacRoles : [];
    }
    return map;
  }, [members]);

  const pendingMembers = useMemo(() => {
    if (membersLoading) return [];
    return members.filter((member) => memberNeedsOnboardingAssignment(member, rbacByUser));
  }, [members, membersLoading, rbacByUser]);

  const messages = useMemo(() => {
    if (membersLoading) return [];
    const count = pendingMembers.length;
    if (count <= 0) return [t('adminDomains.insightAllAssigned')];
    if (count === 1) return [t('adminDomains.insightUnassignedAccountsOne')];
    return [t('adminDomains.insightUnassignedAccounts', { n: count })];
  }, [membersLoading, pendingMembers.length, t]);

  return {
    loading: membersLoading,
    pendingCount: pendingMembers.length,
    messages,
    usersHref: '/app/admin/users',
  };
}
