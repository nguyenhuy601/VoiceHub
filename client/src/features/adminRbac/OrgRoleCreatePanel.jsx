import { useEffect, useMemo, useState } from 'react';
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
import AdminRoleInsertPositionPicker from '../../components/adminUsers/AdminRoleInsertPositionPicker';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { slugifyRoleKey, ensureRoleKeyNamespace } from '../../utils/roleKeySlug';
import {
  ORG_ROLE_LABEL_PREFIX,
  looksLikeHrPositionForOrgRole,
  normalizeLayerLabel,
} from '../../utils/roleLayerNaming';
import { orgRoleCatalogAPI } from '../../services/api/orgRoleCatalogAPI';

export default function OrgRoleCreatePanel({ orgId }) {
  const { t } = useAppStrings();
  const navigate = useNavigate();

  const [suffix, setSuffix] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [roles, setRoles] = useState([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [insertPlace, setInsertPlace] = useState({ place: 'end' });

  const keyPreview = useMemo(
    () => (suffix.trim() ? ensureRoleKeyNamespace(slugifyRoleKey(suffix), 'org') : ''),
    [suffix]
  );

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    (async () => {
      setRolesLoading(true);
      try {
        const res = await orgRoleCatalogAPI.listCatalog(orgId);
        const list = res?.data?.roles || res?.data?.data?.roles || [];
        if (!cancelled) {
          setRoles(
            [...list].sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0))
          );
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(resolveApiErrorMessage(error, { t, fallback: t('common.loadFail') }));
          setRoles([]);
        }
      } finally {
        if (!cancelled) setRolesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, t]);

  const submit = async () => {
    if (!orgId || busy) return;
    if (!suffix.trim()) return;
    const label = normalizeLayerLabel(suffix, 'org');
    setBusy(true);
    try {
      await orgRoleCatalogAPI.createCatalog(orgId, {
        label,
        description,
        key: keyPreview,
        place: insertPlace.place,
        afterRoleId: insertPlace.afterRoleId,
      });
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
            <span className={adminLabelClass()}>{t('adminRbac.roleLabelField')}</span>
            <div className="flex overflow-hidden rounded-lg border border-border bg-background">
              <span className="shrink-0 border-r border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                {ORG_ROLE_LABEL_PREFIX.trimEnd()}
              </span>
              <input
                className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none"
                value={suffix}
                onChange={(e) => setSuffix(e.target.value)}
                placeholder={t('adminRbac.orgRoleLabelPlaceholder')}
              />
            </div>
            {suffix.trim() && looksLikeHrPositionForOrgRole(suffix) ? (
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{t('adminRbac.orgRoleLooksLikePositionHint')}</p>
            ) : null}
          </label>
          <label className="mb-4 block">
            <span className={adminLabelClass()}>{t('adminRbac.roleKeyField')}</span>
            <input
              className={adminInputClass()}
              value={suffix.trim() ? keyPreview : ''}
              readOnly
              placeholder={t('adminRbac.roleKeyAutoPlaceholder')}
            />
            <p className="mt-1 text-xs text-muted-foreground">{t('adminRbac.roleKeyAutoHint')}</p>
          </label>
          <label className="mb-4 block">
            <span className={adminLabelClass()}>{t('adminRbac.roleDescriptionField')}</span>
            <textarea
              className={adminInputClass()}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
            />
          </label>

          <AdminRoleInsertPositionPicker
            roles={roles}
            value={insertPlace}
            onChange={setInsertPlace}
            loading={rolesLoading}
            title={t('adminRbac.roleInsertPlaceTitle')}
            hint={t('adminRbac.roleInsertPlaceHint')}
            startLabel={t('adminRbac.roleInsertStart')}
            endLabel={t('adminRbac.roleInsertEnd')}
            afterPrefix={t('adminRbac.roleInsertAfter')}
            emptyLabel={t('adminRbac.roleInsertEmpty')}
            previewLabel={suffix.trim() || keyPreview || ''}
          />

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" disabled={!suffix.trim() || busy} className={adminPrimaryBtnClass()} onClick={submit}>
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
            {t('adminRbac.orgRoleCreateHint')}
          </div>
          <div className="mt-4 rounded-xl border border-border bg-card p-4">
            <p className="text-sm font-medium">{t('adminDomains.rbac.orgRoleAssign')}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('adminRbac.orgRoleCreateAfterHint')}
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
