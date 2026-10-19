import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAppStrings } from '../../locales/appStrings';
import { buildProjectsPickerPath } from '../../utils/suitePathUtils';

const toastedProjectIds = new Set();

/** Đưa về danh sách dự án và báo user không có vai trò. */
export default function ProjectRoleDeniedRedirect({ projectId, orgId }) {
  const navigate = useNavigate();
  const { t } = useAppStrings();
  const pid = String(projectId || '').trim();

  useEffect(() => {
    if (!toastedProjectIds.has(pid)) {
      toastedProjectIds.add(pid);
      toast.error(t('nav.projectRoleRequired'));
      window.setTimeout(() => toastedProjectIds.delete(pid), 2500);
    }
    navigate(buildProjectsPickerPath(orgId), { replace: true });
  }, [navigate, orgId, pid, t]);

  return null;
}
