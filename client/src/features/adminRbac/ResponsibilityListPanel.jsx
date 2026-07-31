import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminInputClass,
  adminLabelClass,
  adminPrimaryBtnClass,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { organizationAPI } from '../../services/api/organizationAPI';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { slugifyRoleKey } from '../../utils/roleKeySlug';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

export default function ResponsibilityListPanel({ orgId }) {
  const { t } = useAppStrings();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  const keyPreview = useMemo(() => slugifyRoleKey(label), [label]);

  const load = useCallback(async () => {
    if (!orgId) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const res = await organizationAPI.listResponsibilities(orgId);
      const data = unwrap(res);
      setRows(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminRbac.responsibilityLoadFail') }));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [orgId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const seed = async () => {
    try {
      await organizationAPI.seedResponsibilities(orgId);
      toast.success(t('adminRbac.responsibilitySeeded'));
      await load();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminRbac.responsibilityCreateFail') }));
    }
  };

  const create = async (e) => {
    e.preventDefault();
    if (!orgId || busy || !label.trim()) return;
    setBusy(true);
    try {
      await organizationAPI.createResponsibility(orgId, {
        label: label.trim(),
        description,
        key: keyPreview,
      });
      toast.success(t('adminRbac.responsibilityCreated'));
      setLabel('');
      setDescription('');
      await load();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminRbac.responsibilityCreateFail') }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminUserPanelShell
      title={t('adminDomains.rbac.responsibilities')}
      hint={t('adminRbac.responsibilityListHint')}
    >
      <div className="flex flex-wrap gap-2">
        <button type="button" className={adminSecondaryBtnClass()} onClick={seed}>
          {t('adminRbac.responsibilitySeed')}
        </button>
      </div>
      <AdminUserFormCard title={t('adminRbac.responsibilityCreate')}>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={create}>
          <label className={adminLabelClass()}>
            {t('adminRbac.responsibilityLabel')}
            <input
              className={adminInputClass()}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Backend"
              required
            />
          </label>
          <label className={adminLabelClass()}>
            {t('adminRbac.responsibilityKey')}
            <input
              className={adminInputClass()}
              value={label.trim() ? keyPreview : ''}
              readOnly
              placeholder={t('adminRbac.roleKeyAutoPlaceholder')}
            />
            <span className="mt-1 block text-xs font-normal text-muted-foreground">
              {t('adminRbac.roleKeyAutoHint')}
            </span>
          </label>
          <label className={`${adminLabelClass()} sm:col-span-2`}>
            {t('adminRbac.responsibilityDescription')}
            <input
              className={adminInputClass()}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <button type="submit" className={adminPrimaryBtnClass()} disabled={!label.trim() || busy}>
            {busy ? t('common.saving') : t('adminRbac.responsibilityCreate')}
          </button>
        </form>
      </AdminUserFormCard>
      <AdminUserFormCard title={t('adminDomains.rbac.responsibilities')}>
        {loading ? (
          <p className="text-sm text-muted-foreground">{t('adminTasks.loading')}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('adminRbac.responsibilityEmpty')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.key || r._id} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
                <span className="font-medium">
                  {r.label || r.key} <span className="text-muted-foreground">({r.key})</span>
                </span>
                {r.description ? <span className="text-muted-foreground">{r.description}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </AdminUserFormCard>
    </AdminUserPanelShell>
  );
}
