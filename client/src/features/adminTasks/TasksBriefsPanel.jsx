import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AdminUserPanelShell,
  adminDangerBtnClass,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { taskAPI, unwrapTaskApiPayload } from '../../services/api/taskAPI';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';

export default function TasksBriefsPanel({ orgId }) {
  const { t } = useAppStrings();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const res = await taskAPI.listProjectBriefs({
        organizationId: orgId,
        ...(status ? { status } : {}),
      });
      const data = unwrapTaskApiPayload(res);
      setRows(Array.isArray(data) ? data : data?.items || []);
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.briefsLoadFail') }));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [orgId, status, t]);

  useEffect(() => {
    load();
  }, [load]);

  const cancelBrief = async (row) => {
    const name = String(row.title || row._id);
    if (!window.confirm(t('adminTasks.briefsCancelConfirm', { name }))) return;
    try {
      await taskAPI.cancelProjectBrief(row._id);
      toast.success(t('adminTasks.briefsCancelled'));
      await load();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.briefsCancelFail') }));
    }
  };

  return (
    <AdminUserPanelShell title={t('adminDomains.tasks.briefs')} hint={t('adminTasks.briefsHint')} wide>
      <div className="flex flex-wrap gap-2 rounded-xl border border-border bg-card p-4 shadow-sm">
        {['', 'open', 'accepted', 'cancelled'].map((s) => (
          <button
            key={s || 'all'}
            type="button"
            className={adminSecondaryBtnClass(status === s ? '!bg-muted' : '')}
            onClick={() => setStatus(s)}
          >
            {s || t('adminTasks.manageAll')}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {loading ? (
          <p className="px-4 py-8 text-sm text-muted-foreground">{t('adminTasks.loading')}</p>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3">{t('adminTasks.colTitle')}</th>
                    <th className="px-4 py-3">{t('adminTasks.briefsStatus')}</th>
                    <th className="px-4 py-3">{t('adminTasks.briefsPm')}</th>
                    <th className="px-4 py-3">{t('adminTasks.colActions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={String(row._id)} className="border-b border-border/50">
                      <td className="px-4 py-3 font-medium">{row.title || '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{row.status || '—'}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {String(row.assigneePmId || '—')}
                      </td>
                      <td className="px-4 py-3">
                        {row.status === 'open' ? (
                          <button
                            type="button"
                            className={adminDangerBtnClass('!px-3 !py-1.5 text-xs')}
                            onClick={() => cancelBrief(row)}
                          >
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
            </div>
            <div className="space-y-3 p-3 md:hidden">
              {rows.map((row) => (
                <div key={String(row._id)} className="rounded-xl border border-border p-3">
                  <p className="font-medium">{row.title || '—'}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {row.status} · PM {String(row.assigneePmId || '—')}
                  </p>
                  {row.status === 'open' ? (
                    <button
                      type="button"
                      className={adminDangerBtnClass('mt-3 w-full')}
                      onClick={() => cancelBrief(row)}
                    >
                      {t('adminTasks.briefsCancel')}
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
            {!rows.length ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                {t('adminTasks.briefsEmpty')}
              </p>
            ) : null}
          </>
        )}
      </div>
    </AdminUserPanelShell>
  );
}
