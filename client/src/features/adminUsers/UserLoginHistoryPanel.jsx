import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminUserPicker from '../../components/adminUsers/AdminUserPicker';
import { adminUserAPI } from '../../services/api/adminUserAPI';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { unwrapApi } from '../../utils/adminUserUtils';

export default function UserLoginHistoryPanel({ orgId }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const userId = String(searchParams.get('userId') || '').trim();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!orgId || !userId) {
      setItems([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await adminUserAPI.getLoginEvents(orgId, userId, { limit: 100 });
        const data = unwrapApi(res)?.data ?? unwrapApi(res);
        if (!cancelled) setItems(Array.isArray(data?.items) ? data.items : []);
      } catch (error) {
        if (!cancelled) {
          toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminUsers.historyFail') }));
          setItems([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, userId, t]);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <AdminUserPicker orgId={orgId} selectedUserId={userId} hint={t('adminUsers.historyPickerHint')} />
      <div className="rounded-xl border border-border bg-card/40 p-4">
        <h2 className="text-lg font-semibold">{t('adminDomains.users.loginHistory')}</h2>
        {loading ? (
          <p className="mt-2 text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : !userId ? (
          <p className="mt-2 text-sm text-muted-foreground">{t('adminUsers.selectUserFirst')}</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-2 py-2">{t('adminUsers.colTime')}</th>
                  <th className="px-2 py-2">{t('adminUsers.colResult')}</th>
                  <th className="px-2 py-2">IP</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id} className="border-t border-border/60">
                    <td className="px-2 py-2">{row.at ? new Date(row.at).toLocaleString() : '—'}</td>
                    <td className="px-2 py-2">
                      {row.success ? t('adminUsers.loginSuccess') : t('adminUsers.loginFailed')}
                    </td>
                    <td className="px-2 py-2">{row.ip || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!items.length ? (
              <p className="py-4 text-sm text-muted-foreground">{t('adminUsers.noHistory')}</p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
