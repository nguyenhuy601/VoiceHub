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
  PROJECT_ROLE_LABEL_PREFIX,
  looksLikeOrgStructureForProjectRole,
  normalizeLayerLabel,
} from '../../utils/roleLayerNaming';
import { projectRoleAdminAPI } from '../../services/api/projectRoleAdminAPI';

export default function ProjectRoleCreatePanel({ orgId }) {
  const { t } = useAppStrings();
  const navigate = useNavigate();

  const [suffix, setSuffix] = useState('');
  const [canAssign, setCanAssign] = useState(false);
  const [busy, setBusy] = useState(false);
  const [roles, setRoles] = useState([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [insertPlace, setInsertPlace] = useState({ place: 'end' });

  const keyPreview = useMemo(
    () => (suffix.trim() ? ensureRoleKeyNamespace(slugifyRoleKey(suffix), 'prj') : ''),
    [suffix]
  );

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    (async () => {
      setRolesLoading(true);
      try {
        const res = await projectRoleAdminAPI.listRoles(orgId);
        const list = res?.data?.data || res?.data?.roles || res?.data || [];
        if (!cancelled) {
          setRoles(
            [...(Array.isArray(list) ? list : [])].sort(
              (a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0)
            )
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
    setBusy(true);
    try {
      await projectRoleAdminAPI.createRole(orgId, {
        label: normalizeLayerLabel(suffix, 'project'),
        canAssign,
        key: keyPreview,
        place: insertPlace.place,
        afterRoleId: insertPlace.afterRoleId,
      });
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
            <span className={adminLabelClass()}>{t('adminRbac.roleLabelField')}</span>
            <div className="flex overflow-hidden rounded-lg border border-border bg-background">
              <span className="shrink-0 border-r border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                {PROJECT_ROLE_LABEL_PREFIX.trimEnd()}
              </span>
              <input
                className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none"
                value={suffix}
                onChange={(e) => setSuffix(e.target.value)}
                placeholder={t('adminRbac.projectRoleLabelPlaceholder')}
              />
            </div>
            {suffix.trim() && looksLikeOrgStructureForProjectRole(suffix) ? (
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{t('adminRbac.projectRoleLooksLikeOrgHint')}</p>
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

          <label className="mb-4 flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              className="mt-1 rounded border-border"
              checked={canAssign}
              onChange={(e) => setCanAssign(e.target.checked)}
            />
            <span className="text-muted-foreground">{t('adminRbac.canAssignField')}</span>
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
            <button
              type="button"
              disabled={!suffix.trim() || busy}
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
        <p className="mt-3 text-sm text-muted-foreground">{t('adminRbac.projectRoleCreateHint')}</p>
      </div>
    </AdminUserPanelShell>
  );
}
