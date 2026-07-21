import { useSearchParams } from 'react-router-dom';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminInputClass,
  adminLabelClass,
} from '../../components/adminUsers/adminUserPanelUi';
import ProjectDeliveryPanel from './ProjectDeliveryPanel';

/**
 * Admin domain — Project Team + Delegation Graph (cần ?boardId=).
 */
export default function TasksDeliveryAdminPanel() {
  const [params, setParams] = useSearchParams();
  const boardId = String(params.get('boardId') || '').trim();

  return (
    <AdminUserPanelShell
      title="Project Team & Delegation"
      hint="Cấu hình Project Role và đồ thị CanAssign theo board/project. Không dùng HR Role / Organization Role để giao việc."
      wide
    >
      <AdminUserFormCard title="Board / Project">
        <label className={adminLabelClass}>
          boardId
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
            placeholder="ObjectId của TaskBoard"
          />
        </label>
      </AdminUserFormCard>
      <div className="mt-4">
        <ProjectDeliveryPanel boardId={boardId} />
      </div>
    </AdminUserPanelShell>
  );
}
