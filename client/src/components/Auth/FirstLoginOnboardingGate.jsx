import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getJwtSystemRole } from '../../utils/tokenStorage';
import FirstLoginProfileModal from './FirstLoginProfileModal';

function profileIncomplete(user) {
  if (!user) return false;
  if (user?.preferences?.profileCompletedAt) return false;
  const hasName = Boolean(String(user.displayName || '').trim());
  const hasPhone = Boolean(String(user.phone || '').trim());
  const hasJob = Boolean(
    String(user.jobTitle || user?.preferences?.jobTitle || '').trim()
  );
  return !hasName || !hasPhone || !hasJob;
}

/** Tài khoản hệ thống duy nhất (systemRole=admin) — không bắt buộc hồ sơ / đổi MK. */
function isSystemAdminAccount(user) {
  if (String(user?.systemRole || '').trim().toLowerCase() === 'admin') return true;
  if (getJwtSystemRole() === 'admin') return true;
  return false;
}

/**
 * Gate sau login: bắt buộc đổi MK / hoàn thiện hồ sơ trước khi dùng app.
 * Tài khoản hệ thống (systemRole=admin) không bắt buộc bổ sung hồ sơ.
 */
export default function FirstLoginOnboardingGate() {
  const { pathname } = useLocation();
  const { user, isAuthenticated } = useAuth();
  const [dismissed, setDismissed] = useState(false);

  const inAppShell = pathname.startsWith('/app');
  const isSystemAdmin = isSystemAdminAccount(user);
  const mustChangePassword = Boolean(user?.mustChangePassword) && !isSystemAdmin;
  const needsProfile = useMemo(
    () => !isSystemAdmin && profileIncomplete(user),
    [user, isSystemAdmin]
  );
  const open = Boolean(
    inAppShell && isAuthenticated && user && !dismissed && (mustChangePassword || needsProfile)
  );

  if (!open) return null;

  return (
    <FirstLoginProfileModal
      open={open}
      mustChangePassword={mustChangePassword}
      onCompleted={() => setDismissed(true)}
    />
  );
}
