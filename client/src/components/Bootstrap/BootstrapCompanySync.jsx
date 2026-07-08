import { useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { loadBootstrapShell } from '../../services/bootstrapService';

/** Đồng bộ company từ bootstrap sau khi đăng nhập (single-org). */
export default function BootstrapCompanySync() {
  const { isAuthenticated } = useAuth();
  const { applyBootstrapCompany } = useWorkspace();

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      try {
        const boot = await loadBootstrapShell();
        if (!cancelled && boot) applyBootstrapCompany(boot);
      } catch {
        /* bootstrap retry on next navigation */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, applyBootstrapCompany]);

  return null;
}
