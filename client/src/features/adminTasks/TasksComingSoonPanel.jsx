import {
  AdminUserFormCard,
  AdminUserPanelShell,
} from '../../components/adminUsers/adminUserPanelUi';
import { useAppStrings } from '../../locales/appStrings';

export default function TasksComingSoonPanel() {
  const { t } = useAppStrings();
  return (
    <AdminUserPanelShell title={t('adminTasks.comingSoonTitle')} hint={t('adminTasks.comingSoonHint')}>
      <AdminUserFormCard title={t('adminDomains.tasks.sprints')}>
        <p className="text-sm text-muted-foreground">{t('adminTasks.comingSoonHint')}</p>
      </AdminUserFormCard>
      <AdminUserFormCard title={t('adminDomains.tasks.workflow')}>
        <p className="text-sm text-muted-foreground">{t('adminTasks.comingSoonHint')}</p>
      </AdminUserFormCard>
    </AdminUserPanelShell>
  );
}
