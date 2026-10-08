import { useSearchParams } from 'react-router-dom';
import { useAppStrings } from '../../locales/appStrings';
import AdminUserPicker from '../../components/adminUsers/AdminUserPicker';
import { AdminUserPanelShell } from '../../components/adminUsers/adminUserPanelUi';
import AccountLoginHistoryPanel from '../adminAccounts/AccountLoginHistoryPanel';

export default function SecuritySessionsHubPanel({ orgId }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const userId = String(searchParams.get('userId') || '').trim();

  return (
    <AdminUserPanelShell title={t('adminDomains.security.loginHistory')} hint={t('adminSecurity.sessionsHubHint')} wide>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-start">
        <AdminUserPicker orgId={orgId} selectedUserId={userId} hint={t('adminSecurity.sessionsPickerHint')} />
        <AccountLoginHistoryPanel orgId={orgId} embedded />
      </div>
    </AdminUserPanelShell>
  );
}
