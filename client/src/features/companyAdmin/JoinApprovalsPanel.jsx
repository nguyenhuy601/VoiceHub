import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { organizationAPI } from '../../services/api/organizationAPI';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';

const unwrap = (payload) => payload?.data ?? payload;

export default function JoinApprovalsPanel({ orgId }) {
  const { t } = useAppStrings();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [pendingOnly, setPendingOnly] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await organizationAPI.getJoinApplicationsToReview();
      const data = unwrap(res);
      const list = Array.isArray(data) ? data : data?.data || [];
      const filtered = orgId
        ? list.filter((a) => String(a.organizationId || a.organization?._id || '') === String(orgId))
        : list;
      setItems(filtered);
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('companyAdmin.loadApprovalsFail') }));
    } finally {
      setLoading(false);
    }
  }, [orgId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const visibleItems = useMemo(() => {
    if (!pendingOnly) return items;
    return items.filter((a) => String(a.status || 'pending').toLowerCase() === 'pending');
  }, [items, pendingOnly]);

  const review = async (applicationId, action) => {
    if (!orgId || !applicationId) return;
    setBusyId(String(applicationId));
    try {
      await organizationAPI.reviewJoinApplication(orgId, applicationId, { action });
      toast.success(action === 'approve' ? t('companyAdmin.approved') : t('companyAdmin.rejected'));
      await load();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('companyAdmin.reviewFail') }));
    } finally {
      setBusyId('');
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">{t('common.loading')}</p>;
  }

  if (!visibleItems.length) {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{t('companyAdmin.tabApprovals')}</h2>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={pendingOnly} onChange={(e) => setPendingOnly(e.target.checked)} />
            {t('adminUsers.filterPendingOnly')}
          </label>
        </div>
        <p className="text-sm text-muted-foreground">{t('companyAdmin.noPendingApplications')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{t('companyAdmin.tabApprovals')}</h2>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={pendingOnly} onChange={(e) => setPendingOnly(e.target.checked)} />
          {t('adminUsers.filterPendingOnly')}
        </label>
      </div>
      <ul className="space-y-3">
        {visibleItems.map((app) => {
          const appId = app.applicationId || app._id || app.id;
          const name =
            app?.applicantSnapshot?.fullName ||
            app?.applicantSnapshot?.email ||
            app?.applicantUser ||
            t('common.user');
          return (
            <li
              key={String(appId)}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3"
            >
              <div>
                <div className="font-medium">{name}</div>
                <div className="text-xs text-muted-foreground">
                  {app.submittedAt ? new Date(app.submittedAt).toLocaleString() : ''}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busyId === String(appId)}
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                  onClick={() => review(appId, 'approve')}
                >
                  {t('companyAdmin.approve')}
                </button>
                <button
                  type="button"
                  disabled={busyId === String(appId)}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs"
                  onClick={() => review(appId, 'reject')}
                >
                  {t('companyAdmin.reject')}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
