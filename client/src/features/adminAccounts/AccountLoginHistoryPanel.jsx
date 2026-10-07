import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import AdminUserPicker from '../../components/adminUsers/AdminUserPicker';
import {
  AdminDenseMobileList,
  AdminUserFormCard,
  AdminUserPanelShell,
  adminDenseRowClass,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { adminUserAPI } from '../../services/api/adminUserAPI';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { AccountLoadError, AccountStatusPill, unwrapSummary } from './accountPanelParts';
import { summarizeUserAgent } from './userAgentSummary';

const PAGE_SIZE = 50;

export default function AccountLoginHistoryPanel({ orgId, embedded = false }) {
  const { t, locale } = useAppStrings();
  const [searchParams] = useSearchParams();
  const userId = String(searchParams.get('userId') || '').trim();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    setPage(1);
  }, [orgId, userId]);

  useEffect(() => {
    if (!orgId || !userId) {
      setItems([]);
      setTotal(0);
      setLoadError('');
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    adminUserAPI
      .getLoginEvents(orgId, userId, { limit: PAGE_SIZE, page })
      .then((res) => {
        if (cancelled) return;
        const data = unwrapSummary(res);
        setItems(Array.isArray(data?.items) ? data.items : []);
        setTotal(Number(data?.total) || 0);
      })
      .catch((error) => {
        if (cancelled) return;
        setLoadError(resolveApiErrorMessage(error, { t, fallback: t('adminUsers.historyFail') }));
        setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, userId, page, t, reloadTick]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const formatTime = (value) => (value ? new Date(value).toLocaleString(locale) : '—');
  const deviceLabel = (row) => summarizeUserAgent(row.userAgent) || t('adminAccounts.unknownDevice');
  const reasonLabel = (row) => {
    if (row.success || !row.errorCode) return '';
    const key = `errors.codes.${row.errorCode}`;
    const mapped = t(key);
    return mapped && mapped !== key ? mapped : t('adminAccounts.reasonUnknown');
  };
  const resultPill = (row) =>
    row.success ? (
      <AccountStatusPill tone="success">{t('adminUsers.loginSuccess')}</AccountStatusPill>
    ) : (
      <AccountStatusPill tone="danger">{t('adminUsers.loginFailed')}</AccountStatusPill>
    );

  const historyCard = (
    <AdminUserFormCard title={t('adminDomains.accounts.loginHistory')}>
      {!userId ? (
        <p className="text-sm text-muted-foreground">{t('adminUsers.selectUserFirst')}</p>
      ) : loadError ? (
        <AccountLoadError message={loadError} onRetry={() => setReloadTick((n) => n + 1)} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border" aria-busy={loading || undefined}>
          {loading && !items.length ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t('common.loading')}</p>
          ) : (
            <>
              <div className="hidden max-h-[420px] overflow-auto md:block">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-3 py-2.5">{t('adminUsers.colTime')}</th>
                      <th scope="col" className="px-3 py-2.5">{t('adminUsers.colResult')}</th>
                      <th scope="col" className="px-3 py-2.5">{t('adminAccounts.colDevice')}</th>
                      <th scope="col" className="px-3 py-2.5">{t('adminAccounts.colIp')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((row) => (
                      <tr key={row.id} className={adminDenseRowClass()}>
                        <td className="whitespace-nowrap px-3 py-2.5 text-foreground">{formatTime(row.at)}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-col items-start gap-1">
                            {resultPill(row)}
                            {reasonLabel(row) ? (
                              <span className="text-xs text-muted-foreground">{reasonLabel(row)}</span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">{deviceLabel(row)}</td>
                        <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{row.ip || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <AdminDenseMobileList
                items={items}
                getKey={(row) => row.id}
                ariaLabel={t('adminDomains.accounts.loginHistory')}
                renderTitle={(row) => (
                  <span className="flex flex-wrap items-center gap-2">
                    {resultPill(row)}
                    <span className="text-sm text-foreground">{formatTime(row.at)}</span>
                  </span>
                )}
                renderMeta={(row) =>
                  [deviceLabel(row), row.ip || '—', reasonLabel(row)].filter(Boolean).join(' · ')
                }
              />
              {!items.length ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t('adminUsers.noHistory')}</p>
              ) : null}
            </>
          )}
          {total > PAGE_SIZE ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2">
              <span className="text-xs text-muted-foreground">
                {t('adminAccounts.historyPageInfo', { page, pages: pageCount, total })}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={adminSecondaryBtnClass()}
                  disabled={loading || page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  {t('adminAccounts.prevPage')}
                </button>
                <button
                  type="button"
                  className={adminSecondaryBtnClass()}
                  disabled={loading || page >= pageCount}
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                >
                  {t('adminAccounts.nextPage')}
                </button>
              </div>
            </div>
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
