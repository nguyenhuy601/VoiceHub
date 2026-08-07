import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppStrings } from '../../locales/appStrings';
import { AdminUserPanelShell } from '../../components/adminUsers/adminUserPanelUi';
import UserExcelImportPanel from './UserExcelImportPanel';
import UserCreatePanel from './UserCreatePanel';
import UserImportPanel from './UserImportPanel';

const MODE_EXCEL = 'excel';
const MODE_INVITE = 'invite';
const MODE_CSV = 'csv';

/**
 * Một cửa “Thêm nhân sự”:
 * - excel (mặc định): nạp HR master (profile + phòng + capacity)
 * - invite: mời 1 người
 * - csv: advanced (cùng pipeline invite), không cạnh Excel như peer
 */
export default function UserImportHubPanel({ orgId }) {
  const { t } = useAppStrings();
  const [searchParams, setSearchParams] = useSearchParams();

  const mode = useMemo(() => {
    const raw = String(searchParams.get('mode') || searchParams.get('tab') || '')
      .toLowerCase()
      .trim();
    if (raw === MODE_INVITE || raw === 'create') return MODE_INVITE;
    if (raw === MODE_CSV) return MODE_CSV;
    return MODE_EXCEL;
  }, [searchParams]);

  const setMode = (next) => {
    const params = new URLSearchParams(searchParams);
    params.delete('tab');
    if (next === MODE_EXCEL) params.delete('mode');
    else params.set('mode', next);
    setSearchParams(params, { replace: true });
  };

  const tabBtn = (id, label) => {
    const active = mode === id;
    return (
      <button
        type="button"
        onClick={() => setMode(id)}
        className={[
          'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
          active
            ? 'bg-primary text-primary-foreground shadow-sm'
            : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground',
        ].join(' ')}
      >
        {label}
      </button>
    );
  };

  return (
    <AdminUserPanelShell title={t('adminDomains.users.import')} hint={t('adminUsers.importHubHint')}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {tabBtn(MODE_EXCEL, t('adminDomains.users.modeExcel'))}
        {tabBtn(MODE_INVITE, t('adminDomains.users.modeInvite'))}
        {mode === MODE_CSV ? tabBtn(MODE_CSV, t('adminDomains.users.modeCsvAdvanced')) : null}
      </div>

      {mode === MODE_INVITE ? <UserCreatePanel orgId={orgId} embedded /> : null}
      {mode === MODE_EXCEL ? <UserExcelImportPanel orgId={orgId} embedded /> : null}
      {mode === MODE_CSV ? <UserImportPanel orgId={orgId} embedded /> : null}

      {mode !== MODE_CSV ? (
        <button
          type="button"
          className="mt-4 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          onClick={() => setMode(MODE_CSV)}
        >
          {t('adminUsers.openCsvAdvanced')}
        </button>
      ) : null}
    </AdminUserPanelShell>
  );
}
