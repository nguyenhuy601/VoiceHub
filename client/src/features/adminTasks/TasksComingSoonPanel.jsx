import {
  AdminUserFormCard,
  AdminUserPanelShell,
} from '../../components/adminUsers/adminUserPanelUi';
import { useAppStrings } from '../../locales/appStrings';

/** Stub Pha 2 — Policies (WIP / DoD / required fields). */
export default function TasksComingSoonPanel() {
  const { t } = useAppStrings();
  return (
    <AdminUserPanelShell
      title={t('adminDomains.projects.policies')}
      hint={t('adminTasks.comingSoonHint')}
    >
      <AdminUserFormCard title={t('adminDomains.projects.policies')}>
        <p className="text-sm text-muted-foreground">{t('adminTasks.policiesComingSoonHint')}</p>
      </AdminUserFormCard>
    </AdminUserPanelShell>
  );
}
