import { useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import {
  getLastBootstrapShellPayload,
  loadBootstrapShell,
} from '../../services/bootstrapService';

/**
 * Đồng bộ company từ bootstrap sau khi đăng nhập (single-org).
 * Vẫn applyBootstrapCompany — chỉ tránh HTTP lần 2 khi auth đã hydrate shell.
 */
export default function BootstrapCompanySync() {
  const { isAuthenticated } = useAuth();
  const { applyBootstrapCompany } = useWorkspace();

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    let cancelled = false;
    (async () => {
      try {
        let boot = getLastBootstrapShellPayload();
        if (!boot) {
          boot = await loadBootstrapShell();
        }
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
