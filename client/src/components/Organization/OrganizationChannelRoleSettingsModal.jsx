import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Trash2 } from 'lucide-react';
import roleAPI from '../../services/api/roleAPI';
import { organizationAPI } from '../../services/api/organizationAPI';
import { channelNameToDisplaySlug } from '../../utils/orgEntityDisplay';
import { useAppStrings } from '../../locales/appStrings';
import { normalizeRoleDisplayName } from './roleRbacUtils';
import ChannelPermissionTriToggle from './ChannelPermissionTriToggle';
import {
  applyChannelPermissionToggle,
  channelPermissionGroups,
  defaultChannelRolePermissions,
  emptyChannelRolePermissions,
} from './channelRolePermissionDefs';
import { roleAccentColor } from './channelRolePermissionDefs';
import { isProtectedDefaultChannel } from '../../utils/orgChannelScope';
import Modal from '../Shared/Modal';
import ConfirmDialog from '../Shared/ConfirmDialog';
import {
  adminDangerBtnClass,
  adminPrimaryBtnClass,
  adminSecondaryBtnClass,
} from '../adminUsers/adminUserPanelUi';

const unwrap = (payload) => payload?.data ?? payload;

export default function OrganizationChannelRoleSettingsModal({
  isOpen,
  onClose,
  organizationId,
  channel,
  locale,
  isDarkMode,
  canManageChannelRoles = false,
  onDeleteChannel,
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
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const channelId = channel?._id ? String(channel._id) : '';
  const isVoice = String(channel?.type || 'chat').toLowerCase() === 'voice';
  const channelLabel = channel?.name
    ? channelNameToDisplaySlug(channel.name, locale)
    : t('organizations.memberSidebarFilesUnknownChannel');
  const channelProtected = isProtectedDefaultChannel(channel);
  const formBusy = saving || loading;

  const permGroups = useMemo(
    () => channelPermissionGroups({ isVoiceChannel: isVoice, t }),
    [isVoice, t]
  );

  const loadData = useCallback(async () => {
    if (!organizationId || !channelId) return;
    setLoading(true);
    setLoadError(false);
    try {
      const [rolesRes, aclRes] = await Promise.all([
        roleAPI.getRolesByOrganization(organizationId),
        organizationAPI.listChannelRoleAccess(organizationId, channelId),
      ]);
      const roleListRaw = unwrap(rolesRes);
      const roleList = Array.isArray(roleListRaw)
        ? roleListRaw
        : Array.isArray(roleListRaw?.data)
          ? roleListRaw.data
          : [];
      const aclBody = unwrap(aclRes);
      const aclData = aclBody?.data ?? aclBody;
      const entries = Array.isArray(aclData?.entries) ? aclData.entries : [];

      const roleById = new Map(
        roleList.map((r) => [
          String(r._id || r.id),
          {
            id: String(r._id || r.id),
            name: normalizeRoleDisplayName(r.name),
          },
        ])
      );

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
    } catch {
      toast.error(t('organizations.channelRolePermLoadFail'));
      setLoadError(true);
      setOrgRoles([]);
      setAssigned([]);
      setSelectedRoleId('');
    } finally {
      setLoading(false);
    }
  }, [organizationId, channelId, t]);

  useEffect(() => {
    if (!isOpen) {
      setDeleteConfirm(false);
      setDeleting(false);
      setLoadError(false);
      return;
    }
    setAddOpen(false);
    setDeleteConfirm(false);
    loadData();
  }, [isOpen, loadData]);

  const handleConfirmDelete = async () => {
    if (!channelId || channelProtected || !onDeleteChannel) return;
    setDeleting(true);
    try {
      await onDeleteChannel(channel);
      setDeleteConfirm(false);
      onClose?.();
    } catch {
      toast.error(t('organizations.deleteChannelFail'));
    } finally {
      setDeleting(false);
    }
  };

  const assignedIds = useMemo(() => new Set(assigned.map((r) => r.id)), [assigned]);

  const availableToAdd = useMemo(
    () => orgRoles.filter((r) => !assignedIds.has(r.id)),
    [orgRoles, assignedIds]
  );

  const selectedRole = assigned.find((r) => r.id === selectedRoleId) || assigned[0] || null;

  const setSelectedPerm = (key, allowed) => {
    if (!selectedRole?.id || !canManageChannelRoles || formBusy) return;
    setAssigned((prev) =>
      prev.map((row) =>
        row.id === selectedRole.id
          ? { ...row, permissions: applyChannelPermissionToggle(row.permissions, key, allowed) }
          : row
      )
    );
  };

  const handleAddRole = (role) => {
    if (!role?.id || !canManageChannelRoles || formBusy) return;
    if (assignedIds.has(role.id)) return;
    const row = {
      id: role.id,
      name: role.name,
      permissions: defaultChannelRolePermissions(isVoice),
    };
    setAssigned((prev) => [...prev, row]);
    setSelectedRoleId(role.id);
    setAddOpen(false);
  };

  const handleRemoveSelectedRole = () => {
    if (!selectedRole?.id || !canManageChannelRoles || formBusy) return;
    const next = assigned.filter((r) => r.id !== selectedRole.id);
    setAssigned(next);
    setSelectedRoleId(next[0]?.id || '');
  };

  const handleSave = async () => {
    if (!organizationId || !channelId || !canManageChannelRoles) return;
    setSaving(true);
    try {
      const entries = assigned.map((row) => ({
        roleId: row.id,
        permissions: row.permissions,
      }));
      await organizationAPI.saveChannelRoleAccess(organizationId, channelId, { entries });
      toast.success(t('organizations.channelRolePermSaved'));
      onSaved?.();
      onClose?.();
    } catch {
      toast.error(t('organizations.channelRolePermSaveFail'));
    } finally {
      setSaving(false);
    }
  };

  const footer = canManageChannelRoles ? (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0 shrink-0">
        {channelProtected ? (
          <span
            className="text-xs text-muted-foreground"
            title={t('organizations.deleteChannelProtected')}
          >
            {t('organizations.deleteChannelProtected')}
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setDeleteConfirm(true)}
            disabled={formBusy || deleting}
            className={adminDangerBtnClass()}
            aria-label={t('organizations.deleteChannelBtn')}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            {t('organizations.deleteChannelBtn')}
          </button>
        )}
      </div>
      <div className="flex shrink-0 gap-2">
        <button type="button" onClick={onClose} className={adminSecondaryBtnClass()}>
          {t('nav.cancel')}
        </button>
        <button
          type="button"
          disabled={formBusy || deleting || loadError}
          onClick={handleSave}
          className={adminPrimaryBtnClass()}
        >
          {saving ? t('organizations.saving') : t('organizations.saveChanges')}
        </button>
      </div>
    </div>
  ) : null;

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={t('organizations.channelRolePermTitle', { channel: channelLabel })}
        size="lg"
        fill
        bodyClassName="!p-0"
        panelClassName="h-[min(640px,90vh)]"
        footer={footer}
      >
        {!canManageChannelRoles ? (
          <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
            {t('organizations.channelRolePermManageDenied')}
          </div>
        ) : loadError ? (
          <div
            role="alert"
            className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center"
          >
            <p className="text-sm text-destructive">
              {t('organizations.channelRolePermLoadFail')}
            </p>
            <button type="button" onClick={loadData} className={adminSecondaryBtnClass()}>
              {t('common.retry')}
            </button>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1">
            <aside className="flex w-[220px] shrink-0 flex-col border-r border-border bg-muted">
              <div className="flex items-center justify-between px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                <span>{t('organizations.channelRolePermSidebarTitle')}</span>
                <div className="relative">
                  <button
                    type="button"
                    title={t('organizations.channelRolePermAddRole')}
                    aria-label={t('organizations.channelRolePermAddRole')}
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
                    {t('organizations.channelRolePermEmpty')}
                  </p>
                ) : (
                  assigned.map((role, idx) => {
                    const active = String(selectedRole?.id) === role.id;
                    return (
                      <button
                        key={role.id}
                        type="button"
                        onClick={() => setSelectedRoleId(role.id)}
                        className={`mb-0.5 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition ${
                          active
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
                    );
                  })
                )}
              </div>

              {selectedRole && canManageChannelRoles ? (
                <div className="border-t border-border px-3 py-2">
                  <button
                    type="button"
                    onClick={handleRemoveSelectedRole}
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
                  {t('organizations.channelRolePermAddRoleHint')}
                </div>
              ) : (
                <div className="scrollbar-chat min-h-0 flex-1 overflow-y-auto px-5 py-4">
                  <p className="mb-4 text-xs text-muted-foreground">
                    {t('organizations.channelRolePermScopeNote', { channel: channelLabel })}
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
                              disabled={!canManageChannelRoles || formBusy}
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
        isOpen={deleteConfirm}
        onClose={() => setDeleteConfirm(false)}
        onConfirm={handleConfirmDelete}
        title={t('organizations.deleteChannelTitle')}
        message={t('organizations.deleteChannelMsg')}
        confirmText={t('common.delete')}
        cancelText={t('nav.cancel')}
        variant="danger"
      />
    </>
  );
}
