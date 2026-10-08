import { useSearchParams } from 'react-router-dom';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminInputClass,
  adminLabelClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { useAppStrings } from '../../locales/appStrings';
import ProjectDeliveryPanel from './ProjectDeliveryPanel';

/**
 * Admin domain — Project Team + Delegation Graph (cần ?boardId=).
 */
export default function TasksDeliveryAdminPanel() {
  const { t } = useAppStrings();
  const [params, setParams] = useSearchParams();
  const boardId = String(params.get('boardId') || '').trim();

  return (
    <AdminUserPanelShell
      title={t('adminTasks.deliveryAdminTitle')}
      hint={t('adminTasks.deliveryAdminHint')}
      wide
    >
      <AdminUserFormCard title={t('adminTasks.deliveryBoardCard')}>
        <label className={adminLabelClass}>
          {t('adminTasks.boardIdLabel')}
          <input
            className={adminInputClass}
            value={boardId}
            onChange={(e) => {
              const next = new URLSearchParams(params);
              const v = e.target.value.trim();
              if (v) next.set('boardId', v);
              else next.delete('boardId');
              setParams(next, { replace: true });
            }}
            placeholder={t('adminTasks.deliveryBoardIdPlaceholder')}
          />
        </label>
      </AdminUserFormCard>
      <div className="mt-4">
        <ProjectDeliveryPanel boardId={boardId} />
      </div>
    </AdminUserPanelShell>
  );
}
