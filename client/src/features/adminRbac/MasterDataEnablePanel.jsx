import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminPrimaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { useAppStrings } from '../../locales/appStrings';
import { organizationAPI } from '../../services/api/organizationAPI';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

function CatalogToggleSection({ title, rows, enabledSet, onToggle, disabled }) {
  return (
    <AdminUserFormCard title={title}>
      <ul className="divide-y divide-border">
        {(rows || []).map((row) => (
          <li key={row.key} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span>
              <span className="font-medium">{row.label || row.key}</span>
              <span className="ml-2 text-xs text-muted-foreground">{row.key}</span>
            </span>
            <label className="inline-flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={enabledSet.has(row.key)}
                disabled={disabled}
                onChange={(e) => onToggle(row.key, e.target.checked)}
              />
              {enabledSet.has(row.key) ? 'Enabled' : 'Disabled'}
            </label>
          </li>
        ))}
      </ul>
    </AdminUserFormCard>
  );
}

export default function MasterDataEnablePanel({ orgId }) {
  const { t } = useAppStrings();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [catalog, setCatalog] = useState(null);
  const [draft, setDraft] = useState(null);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const res = await organizationAPI.getMasterData(orgId);
      const data = unwrap(res);
      setCatalog(data);
      setDraft(data?.masterData || null);
    } catch (error) {
      toast.error(
        resolveApiErrorMessage(error, {
          t,
          fallback: t('adminRbac.masterDataLoadFail'),
        })
      );
    } finally {
      setLoading(false);
    }
  }, [orgId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const enabledSets = useMemo(() => {
    const md = draft || {};
    return {
      departments: new Set(md.enabledDepartmentKeys || []),
      positions: new Set(md.enabledPositionKeys || []),
      organizationRoles: new Set(md.enabledOrganizationRoleKeys || []),
      projectRoles: new Set(md.enabledProjectRoleKeys || []),
    };
  }, [draft]);

  const toggleKey = (field, key, checked) => {
    setDraft((prev) => {
      const base = prev || {};
      const list = new Set(base[field] || []);
      if (checked) list.add(key);
      else list.delete(key);
      return { ...base, [field]: [...list] };
    });
  };

  const save = async () => {
    if (!orgId || !draft) return;
    setSaving(true);
    try {
      const res = await organizationAPI.patchMasterDataEnabled(orgId, draft);
      const data = unwrap(res);
      setCatalog(data);
      setDraft(data?.masterData || draft);
      toast.success(t('adminRbac.masterDataSaved'));
    } catch (error) {
      toast.error(
        resolveApiErrorMessage(error, {
          t,
          fallback: t('adminRbac.masterDataSaveFail'),
        })
      );
    } finally {
      setSaving(false);
    }
  };

  if (!orgId) {
    return (
      <AdminUserPanelShell title={t('adminRbac.masterDataTitle')} hint={t('adminRbac.masterDataHint')}>
        <p className="text-sm text-muted-foreground">{t('adminOrg.selectOrgHint')}</p>
      </AdminUserPanelShell>
    );
  }

  return (
    <AdminUserPanelShell title={t('adminRbac.masterDataTitle')} hint={t('adminRbac.masterDataHint')} wide>
      <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
        {t('adminRbac.masterDataNoCreateHint')}
      </p>
      {loading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : (
        <>
          <CatalogToggleSection
            title={t('adminRbac.masterDataDepartments')}
            rows={catalog?.catalogs?.departments}
            enabledSet={enabledSets.departments}
            disabled={saving}
            onToggle={(key, checked) => toggleKey('enabledDepartmentKeys', key, checked)}
          />
          <CatalogToggleSection
            title={t('adminRbac.masterDataPositions')}
            rows={catalog?.catalogs?.positions}
            enabledSet={enabledSets.positions}
            disabled={saving}
            onToggle={(key, checked) => toggleKey('enabledPositionKeys', key, checked)}
          />
          <CatalogToggleSection
            title={t('adminRbac.masterDataOrgRoles')}
            rows={catalog?.catalogs?.organizationRoles}
            enabledSet={enabledSets.organizationRoles}
            disabled={saving}
            onToggle={(key, checked) => toggleKey('enabledOrganizationRoleKeys', key, checked)}
          />
          <CatalogToggleSection
            title={t('adminRbac.masterDataProjectRoles')}
            rows={catalog?.catalogs?.projectRoles}
            enabledSet={enabledSets.projectRoles}
            disabled={saving}
            onToggle={(key, checked) => toggleKey('enabledProjectRoleKeys', key, checked)}
          />
          <div className="flex justify-end">
            <button type="button" className={adminPrimaryBtnClass()} disabled={saving} onClick={save}>
              {t('adminRbac.masterDataSave')}
            </button>
          </div>
        </>
      )}
    </AdminUserPanelShell>
  );
}
