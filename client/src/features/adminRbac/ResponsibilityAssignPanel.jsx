import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminUserPicker from '../../components/adminUsers/AdminUserPicker';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminPrimaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { organizationAPI } from '../../services/api/organizationAPI';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

function unique(arr) {
  return [...new Set((arr || []).map((x) => String(x).trim()).filter(Boolean))];
}

export default function ResponsibilityAssignPanel({ orgId }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const userId = useMemo(() => String(searchParams.get('userId') || '').trim(), [searchParams]);

  const [catalog, setCatalog] = useState([]);
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadCatalog = useCallback(async () => {
    if (!orgId) {
      setCatalog([]);
      return;
    }
    try {
      const res = await organizationAPI.listResponsibilities(orgId);
      const data = unwrap(res);
      setCatalog(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminRbac.responsibilityLoadFail') }));
      setCatalog([]);
    }
  }, [orgId, t]);

  const loadUser = useCallback(async () => {
    if (!orgId || !userId) {
      setSelectedKeys([]);
      return;
    }
    setLoading(true);
    try {
      const res = await organizationAPI.getUserResponsibilities(orgId, userId);
      const data = unwrap(res);
      const rows = Array.isArray(data) ? data : [];
      setSelectedKeys(unique(rows.map((r) => r.responsibilityKey)));
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminRbac.responsibilityLoadFail') }));
      setSelectedKeys([]);
    } finally {
      setLoading(false);
    }
  }, [orgId, userId, t]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const toggle = (key) => {
    const k = String(key || '').trim();
    if (!k) return;
    setSelectedKeys((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!orgId || !userId || busy) return;
    setBusy(true);
    try {
      await organizationAPI.setUserResponsibilities(orgId, userId, selectedKeys);
      toast.success(t('adminRbac.responsibilityAssignDone'));
      await loadUser();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminRbac.responsibilityAssignFail') }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminUserPanelShell
      title={t('adminDomains.rbac.responsibilityAssign')}
      hint={t('adminRbac.responsibilityAssignHint')}
      wide
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <AdminUserPicker
          orgId={orgId}
          selectedUserId={userId}
          hint={t('adminRbac.responsibilityAssignPickerHint')}
        />
        <AdminUserFormCard title={t('adminDomains.rbac.responsibilityAssign')}>
          {!userId ? (
            <p className="text-sm text-muted-foreground">{t('adminUsers.selectUserFirst')}</p>
          ) : loading ? (
            <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
          ) : !catalog.length ? (
            <p className="text-sm text-muted-foreground">{t('adminRbac.responsibilityEmpty')}</p>
          ) : (
            <form className="space-y-4" onSubmit={submit}>
              <ul className="max-h-[420px] divide-y divide-border overflow-auto rounded-xl border border-border/70">
                {catalog.map((row) => {
                  const key = String(row.key || '').trim();
                  const checked = selectedKeys.includes(key);
                  return (
                    <li key={key}>
                      <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-muted/30">
                        <input
                          type="checkbox"
                          className="rounded border-border"
                          checked={checked}
                          onChange={() => toggle(key)}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">
                            {row.label || key}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">{key}</span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              <button type="submit" className={adminPrimaryBtnClass()} disabled={busy}>
                {busy ? t('common.saving') : t('adminRbac.responsibilityAssignSubmit')}
              </button>
            </form>
          )}
        </AdminUserFormCard>
      </div>
    </AdminUserPanelShell>
  );
}
