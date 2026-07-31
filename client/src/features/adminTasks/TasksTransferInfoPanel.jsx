import { Link } from 'react-router-dom';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminPrimaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { useAppStrings } from '../../locales/appStrings';

export default function TasksTransferInfoPanel() {
  const { t } = useAppStrings();
  return (
    <AdminUserPanelShell title={t('adminDomains.tasks.transfer')} hint={t('adminTasks.transferHint')}>
      <AdminUserFormCard title={t('adminDomains.tasks.projectTeam')}>
        <p className="mb-4 text-sm text-muted-foreground">{t('adminTasks.transferHint')}</p>
        <Link to="/app/admin/projects/project-team" className={adminPrimaryBtnClass()}>
          {t('adminTasks.transferCta')}
        </Link>
      </AdminUserFormCard>
    </AdminUserPanelShell>
  );
}
