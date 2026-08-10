import { useMemo, useState } from 'react';
import AdminUserPicker from '../../../components/adminUsers/AdminUserPicker';
import { memberDisplayName, memberUserId } from '../../../utils/adminUserUtils';
import useAdminMembers from '../../../hooks/useAdminMembers';
import { WIZARD_DEFAULT_MEMBER_ROLE } from './projectWizardConstants';
import { wizardUi } from './projectWizardUi';

export default function ProjectWizardStepTeam({
  orgId,
  form,
  patchForm,
  catalogRoles,
  addSeedMember,
  removeSeedMember,
  defaultMemberRole = WIZARD_DEFAULT_MEMBER_ROLE,
  t,
}) {
  const { members } = useAdminMembers(orgId);
  const [pickUserId, setPickUserId] = useState('');
  const [pickRole, setPickRole] = useState(defaultMemberRole || 'developer');

  const memberName = useMemo(() => {
    const map = new Map();
    for (const m of members || []) {
      const id = memberUserId(m);
      if (id) map.set(id, memberDisplayName(m));
    }
    return (id) => map.get(String(id)) || String(id).slice(-6);
  }, [members]);

  const roleOptions = (catalogRoles || []).length
    ? catalogRoles
    : [
        { key: 'developer', label: 'Developer' },
        { key: 'qa_engineer', label: 'QA' },
      ];

  const onAddMember = () => {
    if (!pickUserId) return;
    addSeedMember(pickUserId, [pickRole]);
    setPickUserId('');
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-foreground">
          {t('adminTasks.wizardStepTeamBring') ||
            t('adminTasks.wizardStepTeam') ||
            'Bring your team'}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('adminTasks.wizardStepTeamHint') || 'Chọn PM, Scrum Master và thành viên.'}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <span className={wizardUi.fieldLabel}>
            {t('adminTasks.wizardFieldPm') || 'Project Manager'} *
          </span>
          <div className="mt-1 max-h-48 overflow-auto rounded-lg border border-border">
            <AdminUserPicker
              orgId={orgId}
              selectedUserId={form.projectManagerId}
              onSelect={(id) => patchForm({ projectManagerId: id })}
              hint={t('adminTasks.wizardPickPm') || 'Chọn PM'}
            />
          </div>
        </div>
        <div>
          <span className={wizardUi.fieldLabel}>
            {t('adminTasks.wizardFieldSm') || 'Scrum Master'}
          </span>
          <div className="mt-1 max-h-48 overflow-auto rounded-lg border border-border">
            <AdminUserPicker
              orgId={orgId}
              selectedUserId={form.scrumMasterId}
              onSelect={(id) => patchForm({ scrumMasterId: id })}
              hint={t('adminTasks.wizardPickSm') || 'Chọn Scrum Master'}
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-muted/20 p-3">
        <p className="mb-2 text-sm font-medium text-foreground">
          {t('adminTasks.wizardAddMembers') || 'Thêm thành viên'}
        </p>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <select
            className={wizardUi.select}
            value={pickUserId}
            onChange={(e) => setPickUserId(e.target.value)}
          >
            <option value="">{t('adminTasks.createNeedUser')}</option>
            {(members || []).map((m) => {
              const id = memberUserId(m);
              if (!id) return null;
              return (
                <option key={id} value={id}>
                  {memberDisplayName(m)}
                </option>
              );
            })}
          </select>
          <select
            className={wizardUi.select}
            value={pickRole}
            onChange={(e) => setPickRole(e.target.value)}
          >
            {roleOptions.map((r) => {
              const key = r.key || r.id || r;
              const lab = r.label || r.name || key;
              return (
                <option key={key} value={key}>
                  {lab}
                </option>
              );
            })}
          </select>
          <button type="button" className={wizardUi.secondaryBtn} onClick={onAddMember}>
            {t('common.add') || 'Add'}
          </button>
        </div>

        <ul className="mt-3 flex flex-wrap gap-2">
          {(form.seedMembers || []).map((m) => (
            <li
              key={m.userId}
              className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground"
            >
              <span>
                {memberName(m.userId)} · {(m.projectRoleKeys || []).join(', ')}
              </span>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => removeSeedMember(m.userId)}
              >
                ×
              </button>
            </li>
          ))}
          {!form.seedMembers?.length ? (
            <li className="text-xs text-muted-foreground">
              {t('adminTasks.wizardNoExtraMembers') || 'Chưa thêm thành viên phụ.'}
            </li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}
