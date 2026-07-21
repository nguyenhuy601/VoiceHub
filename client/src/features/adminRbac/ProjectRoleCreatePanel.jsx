import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminInputClass,
  adminLabelClass,
  adminPrimaryBtnClass,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { projectRoleAdminAPI } from '../../services/api/projectRoleAdminAPI';

export default function ProjectRoleCreatePanel({ orgId }) {
  const { t } = useAppStrings();
  const navigate = useNavigate();

  const [key, setKey] = useState('');
  const [label, setLabel] = useState('');
  const [canAssign, setCanAssign] = useState(false);
  const [sortOrder, setSortOrder] = useState(100);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!orgId || busy) return;
    if (!key.trim() || !label.trim()) return;
    setBusy(true);
    try {
      await projectRoleAdminAPI.createRole(orgId, { key, label, canAssign, sortOrder });
      toast.success(t('common.saveSuccess'));
      navigate('/app/admin/rbac/project-roles');
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('common.saveFail') }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminUserPanelShell title={t('adminDomains.rbac.projectRoleCreate')} hint={t('adminRbac.projectRoleCatalogHint')}>
      <div className="max-w-xl">
        <AdminUserFormCard title={t('adminDomains.rbac.projectRoleCreate')}>
          <label className="mb-4 block">
            <span className={adminLabelClass()}>{t('adminTasks.roleKey') || 'Key'}</span>
            <input className={adminInputClass()} value={key} onChange={(e) => setKey(e.target.value)} />
          </label>
          <label className="mb-4 block">
            <span className={adminLabelClass()}>{t('adminTasks.roleLabel') || 'Label'}</span>
            <input className={adminInputClass()} value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>

          <label className="mb-4 flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              className="mt-1 rounded border-border"
              checked={canAssign}
              onChange={(e) => setCanAssign(e.target.checked)}
            />
            <span className="text-muted-foreground">{t('adminTasks.canAssign') || 'Can assign'}</span>
          </label>

          <label className="mb-2 block">
            <span className={adminLabelClass()}>{t('adminRbac.sortOrder') || 'Sort order'}</span>
            <input
              className={adminInputClass()}
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value))}
            />
          </label>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!key.trim() || !label.trim() || busy}
              className={adminPrimaryBtnClass()}
              onClick={submit}
            >
              {busy ? t('common.saving') : t('common.save')}
            </button>
            <button type="button" disabled={busy} className={adminSecondaryBtnClass()} onClick={() => navigate('/app/admin/rbac/project-roles')}>
              {t('common.cancel') || 'Cancel'}
            </button>
          </div>
        </AdminUserFormCard>
      </div>
    </AdminUserPanelShell>
  );
}

