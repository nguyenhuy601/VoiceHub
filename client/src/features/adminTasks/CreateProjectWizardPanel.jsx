import { useNavigate } from 'react-router-dom';
import {
  AdminUserFormCard,
  adminPrimaryBtnClass,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { buildCollaborateProjectsNewPath } from '../../utils/suitePathUtils';
import { useAppStrings } from '../../locales/appStrings';
import { useEffect } from 'react';

/**
 * Admin Tasks — mở full-screen Project Setup Wizard (cùng page Collaborate).
 */
export default function CreateProjectWizardPanel({ orgId, onCreated, onCancel }) {
  const { t } = useAppStrings();
  const navigate = useNavigate();
  const organizationId = String(orgId || '').trim();
  void onCreated;

  useEffect(() => {
    if (!organizationId) return;
    navigate(buildCollaborateProjectsNewPath(organizationId, { from: 'admin' }), { replace: true });
  }, [organizationId, navigate]);

  if (!organizationId) {
    return (
      <AdminUserFormCard title={t('adminTasks.createTitle')}>
        <p className="text-sm text-muted-foreground">
          {t('organizations.selectOrgFirst') || 'Chọn organization trước.'}
        </p>
        <button type="button" className={adminSecondaryBtnClass()} onClick={() => onCancel?.()}>
          {t('common.cancel')}
        </button>
      </AdminUserFormCard>
    );
  }

  return (
    <AdminUserFormCard title={t('adminTasks.createTitle')}>
      <p className="text-sm text-muted-foreground">
        {t('adminTasks.wizardRedirecting') || 'Đang mở wizard tạo dự án…'}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={adminPrimaryBtnClass()} onClick={() => onCancel?.()}>
          {t('common.cancel')}
        </button>
      </div>
    </AdminUserFormCard>
  );
}
