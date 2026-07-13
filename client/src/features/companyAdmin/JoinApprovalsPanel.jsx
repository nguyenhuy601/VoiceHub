import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Check, X } from 'lucide-react';
import { organizationAPI } from '../../services/api/organizationAPI';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { getInitials } from '../../utils/helpers';
import {
  AdminUserPanelShell,
  adminPrimaryBtnClass,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';

const unwrap = (payload) => payload?.data ?? payload;

function StatusBadge({ status, t }) {
  const s = String(status || 'pending').toLowerCase();
  if (s === 'approved') {
    return (
      <span className="inline-flex rounded-full bg-emerald-500/12 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-500/20 dark:text-emerald-300">
        {t('adminUsers.statusApproved')}
      </span>
    );
  }
  if (s === 'rejected') {
    return (
      <span className="inline-flex rounded-full bg-red-500/12 px-2.5 py-0.5 text-[11px] font-semibold text-red-700 ring-1 ring-red-500/20 dark:text-red-300">
        {t('adminUsers.statusRejected')}
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-amber-500/12 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-500/25 dark:text-amber-200">
      {t('adminUsers.statusPending')}
    </span>
  );
}

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

  return (
    <AdminUserPanelShell
      title={t('companyAdmin.tabApprovals')}
      hint={t('adminUsers.approvalsHint')}
      wide
      actions={
        <label className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm text-muted-foreground shadow-sm">
          <input
            type="checkbox"
            className="rounded border-border"
            checked={pendingOnly}
            onChange={(e) => setPendingOnly(e.target.checked)}
          />
          {t('adminUsers.filterPendingOnly')}
        </label>
      }
    >
      {loading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">{t('adminUsers.colUser')}</th>
                <th className="px-4 py-3">{t('adminUsers.colTime')}</th>
                <th className="px-4 py-3">{t('adminUsers.colStatus')}</th>
                <th className="px-4 py-3 text-right">{t('adminUsers.colActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {visibleItems.map((app) => {
                const appId = app.applicationId || app._id || app.id;
                const email = app?.applicantSnapshot?.email || '';
                const name =
                  app?.applicantSnapshot?.fullName ||
                  email ||
                  app?.applicantUser ||
                  t('common.user');
                const status = String(app.status || 'pending').toLowerCase();
                const isPending = status === 'pending';
                const busy = busyId === String(appId);
                return (
                  <tr key={String(appId)} className="hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-500 to-slate-700 text-[10px] font-bold text-white">
                          {getInitials(name)}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-medium text-foreground">{name}</div>
                          {email ? <div className="truncate text-xs text-muted-foreground">{email}</div> : null}
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {app.submittedAt ? new Date(app.submittedAt).toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={status} t={t} />
                    </td>
                    <td className="px-4 py-3">
                      {isPending ? (
                        <div className="flex flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            className={adminPrimaryBtnClass('!px-3 !py-1.5 text-xs')}
                            onClick={() => review(appId, 'approve')}
                          >
                            <Check className="h-3.5 w-3.5" />
                            {t('companyAdmin.approve')}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            className={adminSecondaryBtnClass('!px-3 !py-1.5 text-xs')}
                            onClick={() => review(appId, 'reject')}
                          >
                            <X className="h-3.5 w-3.5" />
                            {t('companyAdmin.reject')}
                          </button>
                        </div>
                      ) : (
                        <span className="block text-right text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!visibleItems.length ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              {t('companyAdmin.noPendingApplications')}
            </p>
          ) : null}
        </div>
      )}
    </AdminUserPanelShell>
  );
}
