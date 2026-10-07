import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus } from 'lucide-react';
import roleAPI from '../../services/api/roleAPI';
import { organizationAPI } from '../../services/api/organizationAPI';
import { displayDepartmentName } from '../../utils/orgEntityDisplay';
import { useAppStrings } from '../../locales/appStrings';
import { normalizeRoleDisplayName } from './roleRbacUtils';
import ChannelPermissionTriToggle from './ChannelPermissionTriToggle';
import {
  applyChannelPermissionToggle,
  defaultScopeRolePermissions,
  emptyChannelRolePermissions,
  roleAccentColor,
  scopePermissionGroups,
} from './channelRolePermissionDefs';
import Modal from '../Shared/Modal';
import ConfirmDialog from '../Shared/ConfirmDialog';
import {
  adminPrimaryBtnClass,
  adminSecondaryBtnClass,
} from '../adminUsers/adminUserPanelUi';

const unwrap = (payload) => payload?.data ?? payload;

export default function OrganizationScopeRoleSettingsModal({
  isOpen,
  onClose,
  organizationId,
  scopeType,
  scope,
  locale,
  isDarkMode,
  canManage = false,
  onSaved,
}) {
  const { t } = useAppStrings();
  const [orgRoles, setOrgRoles] = useState([]);
  const [assigned, setAssigned] = useState([]);
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);

  const scopeId = scope?._id ? String(scope._id) : '';
  const isDivision = scopeType === 'division';
  const isTeam = scopeType === 'team';
  const scopeLabel = isDivision
    ? String(scope?.name || t('organizations.scopeDivision'))
    : isTeam
      ? String(scope?.name || t('organizations.scopeTeam'))
      : displayDepartmentName(scope?.name, locale);
  const formBusy = saving || loading;

  const permGroups = useMemo(() => scopePermissionGroups(t), [t]);

  const scopeKind = isDivision
    ? t('organizations.scopeDivision')
    : isTeam
      ? t('organizations.scopeTeam')
      : t('organizations.scopeDepartment');

  const loadData = useCallback(async () => {
    if (!organizationId || !scopeId || !scopeType) return;
    setLoading(true);
    setLoadError(false);
    try {
      const listApi = isDivision
        ? organizationAPI.listDivisionRoleAccess
        : isTeam
          ? organizationAPI.listTeamRoleAccess
          : organizationAPI.listDepartmentRoleAccess;
      const silent404 = { skipNotFoundToast: true };

      const rolesRes = await roleAPI.getRolesByOrganization(organizationId);
      const roleListRaw = unwrap(rolesRes);
      const roleList = Array.isArray(roleListRaw)
        ? roleListRaw
        : Array.isArray(roleListRaw?.data)
          ? roleListRaw.data
          : [];

      const roleById = new Map(
        roleList.map((r) => [
          String(r._id || r.id),
          { id: String(r._id || r.id), name: normalizeRoleDisplayName(r.name) },
        ])
      );

      let entries = [];
      try {
        const aclRes = await listApi(organizationId, scopeId, silent404);
        const aclBody = unwrap(aclRes);
        const aclData = aclBody?.data ?? aclBody;
        entries = Array.isArray(aclData?.entries) ? aclData.entries : [];
      } catch (aclErr) {
        if (aclErr?.response?.status !== 404) throw aclErr;
        entries = [];
      }

      const assignedRows = entries
        .map((entry) => {
          const rid = String(entry.roleId || '');
          const meta = roleById.get(rid);
          if (!meta) return null;
          return {
            ...meta,
            permissions: {
              ...emptyChannelRolePermissions(),
              canSee: Boolean(entry.permissions?.canSee),
              canRead: Boolean(entry.permissions?.canRead),
              canWrite: Boolean(entry.permissions?.canWrite),
              canDelete: Boolean(entry.permissions?.canDelete),
              canVoice: Boolean(entry.permissions?.canVoice),
            },
          };
        })
        .filter(Boolean);

      setOrgRoles([...roleById.values()]);
      setAssigned(assignedRows);
      setSelectedRoleId(assignedRows[0]?.id || '');
    } catch (err) {
      if (err?.response?.status === 404) {
        setOrgRoles([]);
        setAssigned([]);
        setSelectedRoleId('');
      } else {
        toast.error(t('organizations.scopeRolePermLoadFail'));
        setLoadError(true);
        setOrgRoles([]);
        setAssigned([]);
        setSelectedRoleId('');
      }
    } finally {
      setLoading(false);
    }
  }, [organizationId, scopeId, scopeType, isDivision, isTeam, t]);

  useEffect(() => {
    if (!isOpen) {
      setRemoveConfirmOpen(false);
      setLoadError(false);
      return;
    }
    setAddOpen(false);
    setRemoveConfirmOpen(false);
    loadData();
  }, [isOpen, loadData]);

  const assignedIds = useMemo(() => new Set(assigned.map((r) => r.id)), [assigned]);
  const availableToAdd = useMemo(
    () => orgRoles.filter((r) => !assignedIds.has(r.id)),
    [orgRoles, assignedIds]
  );
  const selectedRole = assigned.find((r) => r.id === selectedRoleId) || assigned[0] || null;

  const setSelectedPerm = (key, allowed) => {
    if (!selectedRole?.id || !canManage || formBusy) return;
    setAssigned((prev) =>
      prev.map((row) =>
        row.id === selectedRole.id
          ? { ...row, permissions: applyChannelPermissionToggle(row.permissions, key, allowed) }
          : row
      )
    );
  };

  const handleAddRole = (role) => {
    if (!role?.id || !canManage || formBusy || assignedIds.has(role.id)) return;
    setAssigned((prev) => [
      ...prev,
      { id: role.id, name: role.name, permissions: defaultScopeRolePermissions() },
    ]);
    setSelectedRoleId(role.id);
    setAddOpen(false);
  };

  const handleRemoveSelectedRole = () => {
    if (!selectedRole?.id || !canManage || formBusy) return;
    const next = assigned.filter((r) => r.id !== selectedRole.id);
    setAssigned(next);
    setSelectedRoleId(next[0]?.id || '');
  };

  const handleSave = async () => {
    if (!organizationId || !scopeId || !canManage) return;
    setSaving(true);
    try {
      const entries = assigned.map((row) => ({
        roleId: row.id,
        permissions: row.permissions,
      }));
      const saveApi = isDivision
        ? organizationAPI.saveDivisionRoleAccess
        : isTeam
          ? organizationAPI.saveTeamRoleAccess
          : organizationAPI.saveDepartmentRoleAccess;
      await saveApi(organizationId, scopeId, { entries });
      toast.success(
        isDivision
          ? t('organizations.scopeRolePermSavedDivision')
          : isTeam
            ? t('organizations.scopeRolePermSavedTeam')
            : t('organizations.scopeRolePermSavedDepartment')
      );
      onSaved?.();
      onClose?.();
    } catch {
      toast.error(t('organizations.scopeRolePermSaveFail'));
    } finally {
      setSaving(false);
    }
  };

  const addRoleLabel = t('organizations.channelRolePermAddRole');

  const footer = canManage ? (
    <div className="flex justify-end gap-2">
      <button type="button" onClick={onClose} className={adminSecondaryBtnClass()}>
        {t('nav.cancel')}
      </button>
      <button
        type="button"
        disabled={formBusy || loadError}
        onClick={handleSave}
        className={adminPrimaryBtnClass()}
      >
        {saving ? t('organizations.saving') : t('organizations.saveChanges')}
      </button>
    </div>
  ) : null;

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={t('organizations.scopeRolePermTitle', { scopeKind, scopeLabel })}
        size="lg"
        fill
        bodyClassName="!p-0"
        panelClassName="h-[min(640px,90vh)]"
        footer={footer}
      >
        {!canManage ? (
          <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
            {t('organizations.scopeRolePermManageDenied')}
          </div>
        ) : loadError ? (
          <div
            role="alert"
            className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center"
          >
            <p className="text-sm text-destructive">{t('organizations.scopeRolePermLoadFail')}</p>
            <button type="button" onClick={loadData} className={adminSecondaryBtnClass()}>
              {t('common.retry')}
            </button>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1">
            <aside className="flex w-[220px] shrink-0 flex-col border-r border-border bg-muted">
              <div className="flex items-center justify-between px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                <span>{t('organizations.memberMenuRoles')}</span>
                <div className="relative">
                  <button
                    type="button"
                    title={addRoleLabel}
                    aria-label={addRoleLabel}
                    disabled={!availableToAdd.length || formBusy}
                    onClick={() => setAddOpen((v) => !v)}
                    className="rounded p-0.5 text-foreground hover:bg-card disabled:opacity-30"
                  >
                    <Plus className="h-4 w-4" aria-hidden />
                  </button>
                  {addOpen && availableToAdd.length > 0 && !formBusy ? (
                    <div className="absolute right-0 top-full z-20 mt-1 max-h-48 w-52 overflow-y-auto rounded-lg border border-border bg-card py-1 shadow-xl">
                      {availableToAdd.map((role) => (
                        <button
                          key={role.id}
                          type="button"
                          onClick={() => handleAddRole(role)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-muted"
                        >
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: roleAccentColor(role.id) }}
                            aria-hidden
                          />
                          <span className="truncate">{role.name}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="scrollbar-chat min-h-0 flex-1 overflow-y-auto px-2 py-1">
                {loading ? (
                  <p className="px-2 py-3 text-xs text-muted-foreground">{t('common.loading')}</p>
                ) : assigned.length === 0 ? (
                  <p className="px-2 py-3 text-xs leading-relaxed text-muted-foreground">
                    {t('organizations.scopeRolePermAddRoleHint', {
                      scopeKind: scopeKind.toLowerCase(),
                    })}
                  </p>
                ) : (
                  assigned.map((role, idx) => (
                    <button
                      key={role.id}
                      type="button"
                      onClick={() => setSelectedRoleId(role.id)}
                      className={`mb-0.5 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm ${
                        selectedRole?.id === role.id
                          ? 'bg-card text-foreground shadow-sm'
                          : 'text-muted-foreground hover:bg-card/60 hover:text-foreground'
                      }`}
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: roleAccentColor(role.id, idx) }}
                        aria-hidden
                      />
                      <span className="truncate font-medium">{role.name}</span>
                    </button>
                  ))
                )}
              </div>
              {selectedRole ? (
                <div className="border-t border-border px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setRemoveConfirmOpen(true)}
                    disabled={formBusy}
                    className="w-full rounded-md px-2 py-1.5 text-left text-xs font-medium text-destructive hover:bg-muted disabled:opacity-50"
                  >
                    {t('organizations.channelRolePermRemoveRole', { role: selectedRole.name })}
                  </button>
                </div>
              ) : null}
            </aside>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-card text-foreground">
              {loading ? (
                <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                  {t('common.loading')}
                </div>
              ) : !selectedRole ? (
                <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
                  {t('organizations.scopeRolePermAddRoleConfigHint')}
                </div>
              ) : (
                <div className="scrollbar-chat min-h-0 flex-1 overflow-y-auto px-5 py-4">
                  <p className="mb-4 text-xs text-muted-foreground">
                    {t('organizations.scopeRolePermScopeNote', {
                      scopeKind: scopeKind.toLowerCase(),
                      scopeLabel,
                    })}
                  </p>
                  {permGroups.map((group) => (
                    <section key={group.id} className="mb-6">
                      <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                        {group.title}
                      </h3>
                      <div className="space-y-4">
                        {group.items.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-start justify-between gap-4 border-b border-border pb-4"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-semibold text-foreground">{item.title}</div>
                              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                                {item.description}
                              </p>
                            </div>
                            <ChannelPermissionTriToggle
                              allowed={Boolean(selectedRole.permissions[item.key])}
                              onChange={(v) => setSelectedPerm(item.key, v)}
                              isDarkMode={isDarkMode}
                              disabled={!canManage || formBusy}
                            />
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={removeConfirmOpen}
        onClose={() => setRemoveConfirmOpen(false)}
        onConfirm={handleRemoveSelectedRole}
        title={t('organizations.channelRolePermRemoveRole', {
          role: selectedRole?.name || '',
        })}
        message={t('organizations.channelRolePermRemoveRole', {
          role: selectedRole?.name || '',
        })}
        confirmText={t('common.delete')}
        cancelText={t('nav.cancel')}
        variant="danger"
      />
    </>
  );
}
