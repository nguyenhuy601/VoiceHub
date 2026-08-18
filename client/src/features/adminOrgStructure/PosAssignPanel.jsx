/** Position (HR) — admin RBAC */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminUserPicker from '../../components/adminUsers/AdminUserPicker';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminInputClass,
  adminLabelClass,
  adminPrimaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { adminUserAPI } from '../../services/api/adminUserAPI';
import { organizationAPI } from '../../services/api/organizationAPI';
import useAdminMembers from '../../hooks/useAdminMembers';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';

function memberJobTitle(member) {
  return String(member?.jobTitle || member?.preferences?.jobTitle || '').trim();
}

export default function PosAssignPanel({ orgId, embedded = false }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const userId = String(searchParams.get('userId') || '').trim();
  const titleParam = String(searchParams.get('title') || '').trim();
  const { members, loadMembers, error: membersError } = useAdminMembers(orgId);
  const [mode, setMode] = useState(titleParam ? 'existing' : 'existing');
  const [selectedTitle, setSelectedTitle] = useState(titleParam);
  const [customTitle, setCustomTitle] = useState('');
  const [hrPositions, setHrPositions] = useState([]);
  const [positionsLoading, setPositionsLoading] = useState(false);
  const [positionsError, setPositionsError] = useState('');
  const [reloadTick, setReloadTick] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (titleParam) {
      setSelectedTitle(titleParam);
      setMode('existing');
    }
  }, [titleParam]);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    (async () => {
      setPositionsLoading(true);
      setPositionsError('');
      try {
        const res = await organizationAPI.listHrPositions(orgId);
        const data = res?.data?.data ?? res?.data ?? res;
        if (cancelled) return;
        setHrPositions(Array.isArray(data?.positions) ? data.positions : []);
      } catch (error) {
        if (!cancelled) setHrPositions([]);
        if (!cancelled) {
          const msg = resolveApiErrorMessage(error, { t, fallback: t('adminRbac.masterDataLoadFail') });
          setPositionsError(msg);
          toast.error(msg);
        }
      } finally {
        if (!cancelled) setPositionsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, t, reloadTick]);

  const titles = useMemo(() => {
    const set = new Set();
    for (const m of members) {
      const title = memberJobTitle(m);
      if (title) set.add(title);
    }
    for (const row of hrPositions || []) {
      const title = String(row?.title || '').trim();
      if (title) set.add(title);
    }
    if (String(selectedTitle || '').trim()) set.add(String(selectedTitle).trim());
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [members, hrPositions, selectedTitle]);

  const jobTitle =
    mode === 'custom' ? String(customTitle || '').trim() : String(selectedTitle || '').trim();

  const save = async (e) => {
    e.preventDefault();
    if (!orgId || !userId || !jobTitle || saving) return;
    setSaving(true);
    try {
      await adminUserAPI.patchProfile(orgId, userId, { jobTitle });
      toast.success(t('adminOrg.posAssigned'));
      await loadMembers();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminOrg.posAssignFail') }));
    } finally {
      setSaving(false);
    }
  };

  const body = (
    <AdminUserFormCard title={t('adminDomains.rbac.posAssign')}>
      {membersError || positionsError ? (
        <div className="space-y-3">
          <p className="rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {membersError
              ? resolveApiErrorMessage(membersError, { t, fallback: t('companyAdmin.loadMembersFail') })
              : positionsError}
          </p>
          <button
            type="button"
            className={adminPrimaryBtnClass()}
            disabled={saving}
            onClick={async () => {
              await loadMembers();
              setReloadTick((n) => n + 1);
            }}
          >
            {t('adminRbac.retry')}
          </button>
        </div>
      ) : positionsLoading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : (
        <form className="space-y-4" onSubmit={save}>
        <div className="flex flex-wrap gap-3 text-sm">
          <label className="inline-flex items-center gap-2">
            <input
              type="radio"
              name="pos-mode"
              checked={mode === 'existing'}
              onChange={() => setMode('existing')}
            />
            {t('adminOrg.posSelectExisting')}
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="radio"
              name="pos-mode"
              checked={mode === 'custom'}
              onChange={() => setMode('custom')}
            />
            {t('adminOrg.posCreateNew')}
          </label>
        </div>
        {mode === 'existing' ? (
          <label className="block">
            <span className={adminLabelClass()}>{t('adminOrg.posTitle')}</span>
            <select
              required
              className={adminInputClass()}
              value={selectedTitle}
              onChange={(e) => setSelectedTitle(e.target.value)}
            >
              <option value="">{t('adminOrg.selectTitle')}</option>
              {titles.map((title) => (
                <option key={title} value={title}>
                  {title}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="block">
            <span className={adminLabelClass()}>{t('adminOrg.posTitle')}</span>
            <input
              required
              className={adminInputClass()}
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              placeholder={t('adminOrg.posTitle')}
            />
          </label>
        )}
        <button
          type="submit"
          disabled={saving || !userId || !jobTitle}
          className={adminPrimaryBtnClass()}
        >
          {saving ? t('common.saving') : t('adminDomains.rbac.posAssign')}
        </button>
        </form>
      )}
    </AdminUserFormCard>
  );

  if (embedded) return body;

  return (
    <AdminUserPanelShell title={t('adminDomains.rbac.posAssign')} hint={t('adminOrg.posAssignHint')} wide>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <AdminUserPicker orgId={orgId} selectedUserId={userId} hint={t('adminOrg.posAssignUserHint')} />
        {body}
      </div>
    </AdminUserPanelShell>
  );
}
