import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AdminDenseTableCard,
  AdminDenseTableScroll,
  AdminUserPanelShell,
  adminDangerBtnClass,
  adminDenseRowClass,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import {
  AdminBusySpinner,
  AdminEmptyState,
  AdminListSkeleton,
  AdminLoadErrorState,
} from '../../components/adminUsers/adminPanelStates';
import { ConfirmDialog } from '../../components/Shared';
import { taskAPI, unwrapTaskApiPayload } from '../../services/api/taskAPI';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import useAdminMembers from '../../hooks/useAdminMembers';
import { memberLabelById } from '../../utils/adminUserUtils';

const STATUS_FILTERS = ['', 'open', 'accepted', 'cancelled'];

function briefStatusLabel(status, t) {
  if (!status) return t('adminTasks.manageAll');
  const key = `adminTasks.briefStatus_${status}`;
  const label = t(key);
  return label === key ? String(status) : label;
}

export default function TasksBriefsPanel({ orgId }) {
  const { t } = useAppStrings();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [status, setStatus] = useState('');
  const [pendingCancel, setPendingCancel] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const { membersByIdAll } = useAdminMembers(orgId, { view: 'directory' });

  const pmLabel = (row) => {
    const pmId = String(row.assigneePmId || '').trim();
    if (!pmId) return '—';
    return memberLabelById(membersByIdAll, pmId, t('adminTasks.briefsPmUnknown'));
  };

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setLoadError('');
    try {
      const res = await taskAPI.listProjectBriefs({
        organizationId: orgId,
        ...(status ? { status } : {}),
      });
      const data = unwrapTaskApiPayload(res);
      setRows(Array.isArray(data) ? data : data?.items || []);
    } catch (error) {
      setLoadError(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.briefsLoadFail') }));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [orgId, status, t]);

  useEffect(() => {
    load();
  }, [load]);

  const cancelBrief = async (row) => {
    if (cancelling) return;
    setCancelling(true);
    try {
      await taskAPI.cancelProjectBrief(row._id);
      toast.success(t('adminTasks.briefsCancelled'));
      await load();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.briefsCancelFail') }));
    } finally {
      setCancelling(false);
    }
  };

  return (
    <AdminUserPanelShell title={t('adminDomains.tasks.briefs')} hint={t('adminTasks.briefsHint')} wide>
      <div
        className="flex flex-wrap gap-2 rounded-xl border border-border bg-card p-4 shadow-sm"
        role="group"
        aria-label={t('adminTasks.briefsFilterAria')}
      >
        {STATUS_FILTERS.map((s) => (
          <button
            key={s || 'all'}
            type="button"
            aria-pressed={status === s}
            className={adminSecondaryBtnClass(status === s ? '!bg-muted' : '')}
            onClick={() => setStatus(s)}
          >
            {briefStatusLabel(s, t)}
          </button>
        ))}
      </div>

      <AdminDenseTableCard>
        {loading && !rows.length && !loadError ? (
          <AdminListSkeleton rows={5} className="p-4" />
        ) : loadError ? (
          <AdminLoadErrorState className="px-4 py-6" message={loadError} onRetry={load} disabled={loading} />
        ) : (
          <>
            <AdminDenseTableScroll className="hidden md:block">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 z-[1] bg-card">
                  <tr className="border-b border-border bg-muted text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3">{t('adminTasks.colTitle')}</th>
                    <th className="px-4 py-3">{t('adminTasks.briefsStatus')}</th>
                    <th className="px-4 py-3">{t('adminTasks.briefsPm')}</th>
                    <th className="px-4 py-3">{t('adminTasks.colActions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={String(row._id)} className={adminDenseRowClass()}>
                      <td className="px-4 py-3 font-medium">{row.title || '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {row.status ? briefStatusLabel(row.status, t) : '—'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{pmLabel(row)}</td>
                      <td className="px-4 py-3">
                        {row.status === 'open' ? (
                          <button
                            type="button"
                            className={adminDangerBtnClass('!px-3 !py-1.5 text-xs')}
                            disabled={cancelling}
                            aria-busy={cancelling && String(pendingCancel?._id) === String(row._id)}
                            onClick={() => setPendingCancel(row)}
                          >
                            <AdminBusySpinner busy={cancelling && String(pendingCancel?._id) === String(row._id)} />
                            {t('adminTasks.briefsCancel')}
                          </button>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </AdminDenseTableScroll>
            <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3 md:hidden">
              {rows.map((row) => (
                <div key={String(row._id)} className="rounded-xl border border-border p-3">
                  <p className="font-medium">{row.title || '—'}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {row.status ? briefStatusLabel(row.status, t) : '—'} · {t('adminTasks.briefsPm')}{' '}
                    {pmLabel(row)}
                  </p>
                  {row.status === 'open' ? (
                    <button
                      type="button"
                      className={adminDangerBtnClass('mt-3 w-full')}
                      disabled={cancelling}
                      aria-busy={cancelling && String(pendingCancel?._id) === String(row._id)}
                      onClick={() => setPendingCancel(row)}
                    >
                      <AdminBusySpinner busy={cancelling && String(pendingCancel?._id) === String(row._id)} />
                      {t('adminTasks.briefsCancel')}
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
            {!rows.length ? (
              <AdminEmptyState className="!py-10" message={t('adminTasks.briefsEmpty')} />
            ) : null}
          </>
        )}
      </AdminDenseTableCard>

      <ConfirmDialog
        isOpen={Boolean(pendingCancel)}
        onClose={() => setPendingCancel(null)}
        onConfirm={() => (pendingCancel ? cancelBrief(pendingCancel) : undefined)}
        title={t('adminTasks.confirmTitle')}
        message={
          pendingCancel
            ? t('adminTasks.briefsCancelConfirm', { name: String(pendingCancel.title || pendingCancel._id) })
            : ''
        }
        confirmText={t('adminTasks.briefsCancel')}
        cancelText={t('adminTasks.cancel')}
        variant="danger"
      />
    </AdminUserPanelShell>
  );
}
