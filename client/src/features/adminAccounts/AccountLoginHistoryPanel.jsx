import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminUserPicker from '../../components/adminUsers/AdminUserPicker';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminPrimaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { adminUserAPI } from '../../services/api/adminUserAPI';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { unwrapApi } from '../../utils/adminUserUtils';

export default function AccountLoginHistoryPanel({ orgId, embedded = false }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const userId = String(searchParams.get('userId') || '').trim();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (!orgId || !userId) {
      setItems([]);
      setLoadError('');
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError('');
      try {
        const res = await adminUserAPI.getLoginEvents(orgId, userId, { limit: 100 });
        const data = unwrapApi(res)?.data ?? unwrapApi(res);
        if (!cancelled) setItems(Array.isArray(data?.items) ? data.items : []);
      } catch (error) {
        if (!cancelled) {
          const msg = resolveApiErrorMessage(error, { t, fallback: t('adminUsers.historyFail') });
          toast.error(msg);
          setLoadError(msg);
          setItems([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, userId, t, reloadTick]);

  const historyCard = (
        <AdminUserFormCard title={t('adminDomains.accounts.loginHistory')}>
          {loading ? (
            <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
          ) : !userId ? (
            <p className="text-sm text-muted-foreground">{t('adminUsers.selectUserFirst')}</p>
          ) : loadError ? (
            <div className="space-y-3">
              <p className="rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {loadError}
              </p>
              <button type="button" className={adminPrimaryBtnClass()} onClick={() => setReloadTick((n) => n + 1)}>
                {t('adminRbac.retry')}
              </button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border/70">
              <div className="max-h-[420px] overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2.5">{t('adminUsers.colTime')}</th>
                      <th className="px-3 py-2.5">{t('adminUsers.colResult')}</th>
                      <th className="px-3 py-2.5">IP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {items.map((row) => (
                      <tr key={row.id} className="hover:bg-muted/20">
                        <td className="whitespace-nowrap px-3 py-2.5 text-foreground">
                          {row.at ? new Date(row.at).toLocaleString() : '—'}
                        </td>
                        <td className="px-3 py-2.5">
                          {row.success ? (
                            <span className="inline-flex rounded-full bg-emerald-500/12 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-500/20 dark:text-emerald-300">
                              {t('adminUsers.loginSuccess')}
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full bg-red-500/12 px-2.5 py-0.5 text-[11px] font-semibold text-red-700 ring-1 ring-red-500/20 dark:text-red-300">
                              {t('adminUsers.loginFailed')}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{row.ip || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!items.length ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t('adminUsers.noHistory')}</p>
              ) : null}
            </div>
          )}
        </AdminUserFormCard>
  );

  if (embedded) return historyCard;

  return (
    <AdminUserPanelShell title={t('adminDomains.accounts.loginHistory')} hint={t('adminAccounts.historyPickerHint')} wide>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-start">
        <AdminUserPicker orgId={orgId} selectedUserId={userId} hint={t('adminAccounts.historyPickerHint')} />
        {historyCard}
      </div>
    </AdminUserPanelShell>
  );
}
