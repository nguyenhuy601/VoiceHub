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
import { orgRoleCatalogAPI } from '../../services/api/orgRoleCatalogAPI';

export default function OrgRoleCreatePanel({ orgId }) {
  const { t } = useAppStrings();
  const navigate = useNavigate();

  const [key, setKey] = useState('');
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [sortOrder, setSortOrder] = useState(100);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!orgId || busy) return;
    if (!key.trim() || !label.trim()) return;
    setBusy(true);
    try {
      await orgRoleCatalogAPI.createCatalog(orgId, { key, label, description, sortOrder });
      toast.success(t('common.saveSuccess', { defaultValue: 'Saved' }));
      navigate('/app/admin/rbac/org-roles');
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('common.saveFail') }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminUserPanelShell title={t('adminDomains.rbac.orgRoleCreate')} hint={t('adminRbac.orgRoleCatalogHint')}>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <AdminUserFormCard title={t('adminDomains.rbac.orgRoleCreate')}>
          <label className="mb-4 block">
            <span className={adminLabelClass()}>{t('adminDomains.rbac.orgRoleKey') || 'Key'}</span>
            <input
              className={adminInputClass()}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="custom_role_key"
            />
          </label>
          <label className="mb-4 block">
            <span className={adminLabelClass()}>{t('adminDomains.rbac.orgRoleLabel') || 'Label'}</span>
            <input
              className={adminInputClass()}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="My role"
            />
          </label>
          <label className="mb-4 block">
            <span className={adminLabelClass()}>{t('adminOrg.colDescription') || 'Description'}</span>
            <textarea
              className={adminInputClass()}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
            />
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
            <button type="button" disabled={!key.trim() || !label.trim() || busy} className={adminPrimaryBtnClass()} onClick={submit}>
              {busy ? t('common.saving') : t('common.save')}
            </button>
            <button
              type="button"
              disabled={busy}
              className={adminSecondaryBtnClass()}
              onClick={() => navigate('/app/admin/rbac/org-roles')}
            >
              {t('common.cancel') || 'Cancel'}
            </button>
          </div>
        </AdminUserFormCard>

        <div>
          <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
            {t('adminRbac.orgRoleCreateHint') || 'Org roles you create are custom and can be assigned manually.'}
          </div>
          <div className="mt-4 rounded-xl border border-border bg-card p-4">
            <p className="text-sm font-medium">{t('adminDomains.rbac.orgRoleAssign')}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('adminRbac.orgRoleCreateAfterHint') || 'Sau khi tạo, hãy vào Assign để gán role cho user.'}
            </p>
            <button
              type="button"
              disabled={busy}
              className={adminSecondaryBtnClass('mt-3')}
              onClick={() => navigate('/app/admin/rbac/org-roles/assign')}
            >
              {t('adminDomains.rbac.orgRoleAssign')}
            </button>
          </div>
        </div>
      </div>
    </AdminUserPanelShell>
  );
}

