import { Link } from 'react-router-dom';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminPrimaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { useAppStrings } from '../../locales/appStrings';

const STATUSES = ['todo', 'in_progress', 'review', 'done', 'cancelled'];
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

export default function TasksStatusPriorityPanel() {
  const { t } = useAppStrings();

  return (
    <AdminUserPanelShell
      title={`${t('adminDomains.tasks.status')} / ${t('adminDomains.tasks.priority')}`}
      hint={t('adminTasks.statusPriorityHint')}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <AdminUserFormCard title={t('adminTasks.statusList')}>
          <ul className="space-y-2 text-sm">
            {STATUSES.map((s) => (
              <li key={s} className="rounded-lg border border-border px-3 py-2 font-mono">
                {s}
              </li>
            ))}
          </ul>
          <Link
            to="/app/admin/projects/manage?status=todo"
            className={`${adminPrimaryBtnClass()} mt-4 inline-flex`}
          >
            {t('adminTasks.openManage')}
          </Link>
        </AdminUserFormCard>
        <AdminUserFormCard title={t('adminTasks.priorityList')}>
          <ul className="space-y-2 text-sm">
            {PRIORITIES.map((s) => (
              <li key={s} className="rounded-lg border border-border px-3 py-2 font-mono">
                {s}
              </li>
            ))}
          </ul>
          <Link
            to="/app/admin/projects/manage?priority=high"
            className={`${adminPrimaryBtnClass()} mt-4 inline-flex`}
          >
            {t('adminTasks.openManage')}
          </Link>
        </AdminUserFormCard>
      </div>
    </AdminUserPanelShell>
  );
}
