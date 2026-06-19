import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { getRoleMeta } from '../config/roleMeta';
import { resolveUiRoleFromUser } from '../utils/uiRoleUtils';

export function useUiRole() {
  const { user } = useAuth();
  const role = useMemo(() => resolveUiRoleFromUser(user), [user]);
  const meta = useMemo(() => getRoleMeta(role), [role]);
  return {
    role,
    meta,
    isGuest: role === 'guest',
    isPersonal: role === 'personal',
    isManagerOrAbove: Boolean(meta.isManagerOrAbove),
    allowedSuites: meta.navSuites,
  };
}

export default useUiRole;
