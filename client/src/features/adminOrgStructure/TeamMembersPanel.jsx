/** Huy: Domain Cơ cấu tổ chức — admin org-structure */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminOrgUnitPicker from '../../components/adminOrgStructure/AdminOrgUnitPicker';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminPrimaryBtnClass,
  adminInputClass,
} from '../../components/adminUsers/adminUserPanelUi';
import {
  AdminBusySpinner,
  AdminEmptyState,
  AdminListSkeleton,
  AdminLoadErrorState,
} from '../../components/adminUsers/adminPanelStates';
import { organizationAPI } from '../../services/api/organizationAPI';
import useAdminOrgStructure from '../../hooks/useAdminOrgStructure';
import useAdminMembers from '../../hooks/useAdminMembers';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { unitId } from '../../utils/adminOrgStructureUtils';
import { memberDisplayName, memberEmail, memberUserId, memberMatchesQuery } from '../../utils/adminUserUtils';
import ConfirmDialog from '../../components/Shared/ConfirmDialog';
import { diffMemberSets, hasMemberChanges } from './memberSetDiff';

export default function TeamMembersPanel({ orgId, embedded = false }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const unitParam = String(searchParams.get('unitId') || '').trim();
  const { teams, loading, error: structureError, loadStructure } = useAdminOrgStructure(orgId, { includeInactive: embedded });
  const {
    members,
    loading: membersLoading,
    error: membersError,
    loadMembers,
  } = useAdminMembers(orgId, { view: 'directory' });
  const [selectedId, setSelectedId] = useState(unitParam);
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [memberQuery, setMemberQuery] = useState('');
  const visibleMembers = useMemo(
    () => (memberQuery.trim() ? members.filter((m) => memberMatchesQuery(m, memberQuery)) : members),
    [members, memberQuery]
  );

  const selected = useMemo(
    () => teams.find((row) => unitId(row) === selectedId) || null,
    [teams, selectedId]
  );

  useEffect(() => {
    if (unitParam) setSelectedId(unitParam);
  }, [unitParam]);

  useEffect(() => {
    setSelectedMembers(selected?.memberIds || []);
  }, [selected]);

  const toggle = (id) => {
    setSelectedMembers((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const diff = useMemo(
    () => diffMemberSets(selected?.memberIds || [], selectedMembers),
    [selected, selectedMembers]
  );
  const dirty = hasMemberChanges(diff);

  const persist = async () => {
    if (!orgId || !selectedId) return;
    setSaving(true);
    try {
      await organizationAPI.updateTeamByHierarchy(orgId, selectedId, {
        membersAdd: diff.added,
        membersRemove: diff.removed,
      });
      toast.success(t('adminOrg.saved'));
      await Promise.allSettled([loadStructure(), loadMembers()]);
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminOrg.saveFail') }));
    } finally {
      setSaving(false);
    }
  };

  const save = () => {
    if (saving || !dirty) return;
    if (diff.removed.length) {
      setConfirmOpen(true);
      return;
    }
    persist();
  };

  const body = (
    <AdminUserFormCard title={t('adminDomains.orgStructure.teamMembers')}>
      {structureError || membersError ? (
        <AdminLoadErrorState
          message={structureError || resolveApiErrorMessage(membersError, { t, fallback: t('adminOrg.loadFail') })}
          onRetry={() => Promise.allSettled([loadStructure(), loadMembers()])}
        />
      ) : !selected ? (
        <p className="text-sm text-muted-foreground">{t('adminOrg.selectUnitFirst')}</p>
      ) : membersLoading ? (
        <AdminListSkeleton rows={3} />
      ) : (
        <div className="space-y-4">
          <input
            type="search"
            value={memberQuery}
            onChange={(e) => setMemberQuery(e.target.value)}
            placeholder={t('adminOrg.memberSearchLabel')}
            aria-label={t('adminOrg.memberSearchLabel')}
            maxLength={120}
            className={adminInputClass()}
          />
          <div className="max-h-[420px] overflow-auto rounded-xl border border-border">
            <ul className="divide-y divide-border" aria-label={t('adminOrg.memberSearchLabel')}>
              {visibleMembers.map((m) => {
                const id = memberUserId(m);
                const checked = selectedMembers.includes(id);
                return (
                  <li key={id}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-muted">
                      <input
                        type="checkbox"
                        className="rounded border-border"
                        checked={checked}
                        onChange={() => toggle(id)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {memberDisplayName(m)}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {memberEmail(m)}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            {!visibleMembers.length ? <AdminEmptyState message={t('adminUsers.noUsers')} /> : null}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={saving || !dirty}
              aria-busy={saving || undefined}
              className={adminPrimaryBtnClass()}
              onClick={save}
            >
              <AdminBusySpinner busy={saving} />
              {saving ? t('common.saving') : t('common.save')}
            </button>
            {dirty ? (
              <span className="text-xs text-muted-foreground" aria-live="polite">
                {t('adminOrg.memberChangesSummary', {
                  added: diff.added.length,
                  removed: diff.removed.length,
                })}
              </span>
            ) : null}
          </div>
        </div>
      )}
      <ConfirmDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={persist}
        variant="danger"
        title={t('adminOrg.memberRemoveConfirmTitle')}
        message={t('adminOrg.memberRemoveConfirmMessage', { n: diff.removed.length })}
        confirmText={t('adminOrg.memberRemoveConfirmAction')}
        cancelText={t('common.cancel')}
      />
    </AdminUserFormCard>
  );

  if (embedded) return body;

  return (
    <AdminUserPanelShell
      title={t('adminDomains.orgStructure.teamMembers')}
      hint={t('adminOrg.teamMembersHint')}
      wide
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <AdminOrgUnitPicker
          items={teams}
          loading={loading}
          error={structureError}
          onRetry={() => loadStructure()}
          selectedId={selectedId}
          onSelect={setSelectedId}
          hint={t('adminOrg.teamMembersPickerHint')}
          subtitleFn={(row) => row.departmentName || ''}
        />
        {body}
      </div>
    </AdminUserPanelShell>
  );
}
