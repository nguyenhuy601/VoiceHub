import { Link } from 'react-router-dom';
import TasksProjectTeamPanel from '../adminTasks/TasksProjectTeamPanel';
import { adminSecondaryBtnClass } from '../../components/adminUsers/adminUserPanelUi';
import { useAppStrings } from '../../locales/appStrings';

export default function RbacProjectRoleBoardPanel({ orgId }) {
  const { t } = useAppStrings();

  return (
    <div className="space-y-3">
      <TasksProjectTeamPanel
        orgId={orgId}
        panelTitleKey="adminDomains.rbac.projectRoleBoard"
        panelHintKey="adminRbac.projectRoleBoardHint"
      />
      <p className="text-sm text-muted-foreground">
        {t('adminRbac.projectRoleBoardDelegationHint')}{' '}
        <Link to="/app/admin/tasks/delegation" className={adminSecondaryBtnClass('inline-flex !px-2 !py-1 text-xs')}>
          {t('adminRbac.projectRoleBoardDelegationLink')}
        </Link>
      </p>
    </div>
  );
}
