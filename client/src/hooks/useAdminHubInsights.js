import { useEffect, useMemo, useState } from 'react';
import roleAPI from '../services/api/roleAPI';
import { useAppStrings } from '../locales/appStrings';
import useAdminMembers from './useAdminMembers';
import { unwrapList } from '../utils/adminRbacUtils';
import {
  memberNeedsOnboardingAssignment,
  memberUserId,
} from '../utils/adminUserUtils';

export default function useAdminHubInsights(orgId) {
  const { t } = useAppStrings();
  const { members, loading: membersLoading } = useAdminMembers(orgId);
  const [rbacByUser, setRbacByUser] = useState({});
  const [rbacLoading, setRbacLoading] = useState(false);

  useEffect(() => {
    if (!orgId || !members.length) {
      setRbacByUser({});
      setRbacLoading(false);
      return undefined;
    }

    let cancelled = false;
    (async () => {
      setRbacLoading(true);
      try {
        const entries = await Promise.all(
          members.map(async (member) => {
            const uid = memberUserId(member);
            if (!uid) return ['', []];
            try {
              const res = await roleAPI.getUserRoles(uid, orgId);
              return [uid, unwrapList(res)];
            } catch {
              return [uid, []];
            }
          })
        );
        if (!cancelled) {
          setRbacByUser(Object.fromEntries(entries.filter(([uid]) => Boolean(uid))));
        }
      } finally {
        if (!cancelled) setRbacLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orgId, members]);

  const pendingMembers = useMemo(() => {
    if (membersLoading || rbacLoading) return [];
    return members.filter((member) => memberNeedsOnboardingAssignment(member, rbacByUser));
  }, [members, membersLoading, rbacLoading, rbacByUser]);

  const messages = useMemo(() => {
    if (membersLoading || rbacLoading) return [];
    const count = pendingMembers.length;
    if (count <= 0) return [t('adminDomains.insightAllAssigned')];
    if (count === 1) return [t('adminDomains.insightUnassignedAccountsOne')];
    return [t('adminDomains.insightUnassignedAccounts', { n: count })];
  }, [membersLoading, rbacLoading, pendingMembers.length, t]);

  return {
    loading: membersLoading || rbacLoading,
    pendingCount: pendingMembers.length,
    messages,
    usersHref: '/app/admin/users',
  };
}
