import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
import {
  ORG_ROLE_LABEL_PREFIX,
  looksLikeHrPositionForOrgRole,
  normalizeLayerLabel,
  splitLayerLabel,
} from '../../utils/roleLayerNaming';

export default function OrgRoleEditPanel({ orgId }) {
  const { t } = useAppStrings();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const roleId = useMemo(() => String(searchParams.get('roleId') || '').trim(), [searchParams]);

  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState(null);

  const [suffix, setSuffix] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  const loadRole = async () => {
    if (!orgId || !roleId) return;
    setLoading(true);
    try {
      const res = await orgRoleCatalogAPI.listCatalog(orgId);
      const roles = res?.data?.roles || [];
      const found = roles.find((r) => String(r._id || r.id) === roleId);
      setRole(found || null);
      setSuffix(splitLayerLabel(found?.label || '', 'org').suffix || found?.label || '');
      setDescription(found?.description || '');
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('common.loadFail') }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRole();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, roleId]);

  const submit = async () => {
    if (!orgId || !roleId || busy) return;
    if (!suffix.trim()) return;
    setBusy(true);
    try {
      await orgRoleCatalogAPI.updateCatalog(orgId, roleId, {
        label: normalizeLayerLabel(suffix, 'org'),
        description,
      });
      toast.success(t('common.saveSuccess'));
      navigate('/app/admin/rbac/org-roles');
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('common.saveFail') }));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <AdminUserPanelShell title={t('adminDomains.rbac.orgRoleEdit')} hint={t('common.loading')}>
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      </AdminUserPanelShell>
    );
  }

  return (
    <AdminUserPanelShell title={t('adminDomains.rbac.orgRoleEdit')} hint={t('adminRbac.orgRoleCatalogHint')}>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <AdminUserFormCard title={t('adminDomains.rbac.orgRoleEdit')}>
          {!role ? (
            <p className="text-sm text-muted-foreground">{t('adminRbac.notFound') || 'Not found'}</p>
          ) : (
            <>
              <div className="mb-4 rounded-lg border border-border bg-muted/40 p-3 text-sm">
                <span className="text-muted-foreground">{t('adminDomains.rbac.orgRoleKey') || 'Key'}:</span>{' '}
                <span className="font-medium">{role.key}</span>
                {role.isSystem ? <span className="ml-2 text-xs text-emerald-700">System</span> : null}
                <p className="mt-1 text-xs text-muted-foreground">{t('adminRbac.roleKeyImmutableHint')}</p>
              </div>
              <label className="mb-4 block">
                <span className={adminLabelClass()}>{t('adminDomains.rbac.orgRoleLabel') || 'Label'}</span>
                <div className="flex overflow-hidden rounded-lg border border-border bg-background">
                  <span className="shrink-0 border-r border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                    {ORG_ROLE_LABEL_PREFIX.trimEnd()}
                  </span>
                  <input
                    className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none"
                    value={suffix}
                    onChange={(e) => setSuffix(e.target.value)}
                    disabled={role.isSystem}
                    placeholder={t('adminRbac.orgRoleLabelPlaceholder')}
                  />
                </div>
                {suffix.trim() && looksLikeHrPositionForOrgRole(suffix) ? (
                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{t('adminRbac.orgRoleLooksLikePositionHint')}</p>
                ) : null}
              </label>
              <label className="mb-4 block">
                <span className={adminLabelClass()}>{t('adminRbac.roleDescriptionField')}</span>
                <textarea className={adminInputClass()} rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
              </label>
              <p className="mb-2 text-xs text-muted-foreground">{t('adminRbac.roleOrderViaListHint')}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy || role.isSystem}
                  className={adminPrimaryBtnClass()}
                  onClick={submit}
                >
                  {busy ? t('common.saving') : t('common.save')}
                </button>
                <button type="button" disabled={busy} className={adminSecondaryBtnClass()} onClick={() => navigate('/app/admin/rbac/org-roles')}>
                  {t('common.cancel') || 'Cancel'}
                </button>
              </div>
            </>
          )}
        </AdminUserFormCard>

        <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          {role?.isSystem
            ? t('adminRbac.orgRoleEditSystemHint') || 'System role không thể sửa.'
            : t('adminRbac.orgRoleEditHint') || 'Sửa label/description để hiển thị tốt hơn.'}
        </div>
      </div>
    </AdminUserPanelShell>
  );
}

