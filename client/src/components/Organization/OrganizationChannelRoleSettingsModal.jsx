import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ChevronDown, Plus, Trash2, X } from 'lucide-react';
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

  const permGroups = useMemo(
    () => channelPermissionGroups({ isVoiceChannel: isVoice, t }),
    [isVoice, t]
  );

  const loadData = useCallback(async () => {
    if (!organizationId || !channelId) return;
    setLoading(true);
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
      setOrgRoles([]);
      setAssigned([]);
      setSelectedRoleId('');
    } finally {
      setLoading(false);
    }
  }, [organizationId, channelId]);

  useEffect(() => {
    if (!isOpen) {
      setDeleteConfirm(false);
      setDeleting(false);
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
    if (!selectedRole?.id || !canManageChannelRoles) return;
    setAssigned((prev) =>
      prev.map((row) =>
        row.id === selectedRole.id
          ? { ...row, permissions: applyChannelPermissionToggle(row.permissions, key, allowed) }
          : row
      )
    );
  };

  const handleAddRole = (role) => {
    if (!role?.id || !canManageChannelRoles) return;
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
    if (!selectedRole?.id || !canManageChannelRoles) return;
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

  if (!isOpen) return null;

  const panelBg = isDarkMode ? 'bg-[#313338]' : 'bg-white';
  const sidebarBg = isDarkMode ? 'bg-[#2b2d31]' : 'bg-slate-50';
  const borderCls = isDarkMode ? 'border-[#1e1f22]' : 'border-slate-200';
  const textMuted = isDarkMode ? 'text-[#949ba4]' : 'text-slate-500';
  const textMain = isDarkMode ? 'text-[#f2f3f5]' : 'text-slate-900';

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/55"
        aria-label={t('organizations.modalClose')}
        onClick={onClose}
      />
      <div
        className={`relative flex h-[min(640px,90vh)] w-full max-w-4xl flex-col overflow-hidden rounded-xl shadow-2xl ${panelBg} ${textMain}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="channel-advanced-perms-title"
      >
        <header
          className={`flex shrink-0 items-center justify-between border-b px-4 py-3 ${borderCls}`}
        >
          <div className="flex min-w-0 items-center gap-2">
            <h2 id="channel-advanced-perms-title" className="truncate text-base font-bold">
              {t('organizations.channelRolePermTitle', { channel: channelLabel })}
            </h2>
            <ChevronDown className={`h-4 w-4 shrink-0 opacity-50 ${textMuted}`} />
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`rounded-md p-1.5 ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}
            aria-label={t('organizations.modalCloseEsc')}
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {!canManageChannelRoles ? (
          <div className={`flex flex-1 items-center justify-center p-6 text-sm ${textMuted}`}>
            {t('organizations.channelRolePermManageDenied')}
          </div>
        ) : (
          <>
            <div className="flex min-h-0 flex-1">
            <aside
              className={`flex w-[220px] shrink-0 flex-col border-r ${borderCls} ${sidebarBg}`}
            >
              <div className={`flex items-center justify-between px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide ${textMuted}`}>
                <span>{t('organizations.channelRolePermSidebarTitle')}</span>
                {canManageChannelRoles ? (
                  <div className="relative">
                    <button
                      type="button"
                      title={t('organizations.channelRolePermAddRole')}
                      disabled={!availableToAdd.length}
                      onClick={() => setAddOpen((v) => !v)}
                      className={`rounded p-0.5 ${
                        isDarkMode ? 'hover:bg-white/10' : 'hover:bg-slate-200'
                      } disabled:opacity-30`}
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                    {addOpen && availableToAdd.length > 0 ? (
                      <div
                        className={`absolute right-0 top-full z-20 mt-1 max-h-48 w-52 overflow-y-auto rounded-lg border py-1 shadow-xl ${
                          isDarkMode
                            ? 'border-[#1e1f22] bg-[#111214]'
                            : 'border-slate-200 bg-white'
                        }`}
                      >
                        {availableToAdd.map((role) => (
                          <button
                            key={role.id}
                            type="button"
                            onClick={() => handleAddRole(role)}
                            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                              isDarkMode ? 'hover:bg-white/[0.06]' : 'hover:bg-slate-50'
                            }`}
                          >
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: roleAccentColor(role.id) }}
                            />
                            <span className="truncate">{role.name}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="scrollbar-chat min-h-0 flex-1 overflow-y-auto px-2 py-1">
                {loading ? (
                  <p className={`px-2 py-3 text-xs ${textMuted}`}>{t('common.loading')}</p>
                ) : assigned.length === 0 ? (
                  <p className={`px-2 py-3 text-xs leading-relaxed ${textMuted}`}>
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
                            ? isDarkMode
                              ? 'bg-[#404249] text-white'
                              : 'bg-white text-slate-900 shadow-sm'
                            : isDarkMode
                              ? 'text-[#b5bac1] hover:bg-white/[0.04]'
                              : 'text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: roleAccentColor(role.id, idx) }}
                        />
                        <span className="truncate font-medium">{role.name}</span>
                      </button>
                    );
                  })
                )}
              </div>

              {selectedRole && canManageChannelRoles ? (
                <div className={`border-t px-3 py-2 ${borderCls}`}>
                  <button
                    type="button"
                    onClick={handleRemoveSelectedRole}
                    className="w-full rounded-md px-2 py-1.5 text-left text-xs font-medium text-rose-400 hover:bg-rose-500/10"
                  >
                    {t('organizations.channelRolePermRemoveRole', { role: selectedRole.name })}
                  </button>
                </div>
              ) : null}
            </aside>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {loading ? (
                <div className={`flex flex-1 items-center justify-center text-sm ${textMuted}`}>
                  {t('common.loading')}
                </div>
              ) : !selectedRole ? (
                <div className={`flex flex-1 items-center justify-center p-6 text-sm ${textMuted}`}>
                  {t('organizations.channelRolePermAddRoleHint')}
                </div>
              ) : (
                <div className="scrollbar-chat min-h-0 flex-1 overflow-y-auto px-5 py-4">
                  <p className={`mb-4 text-xs ${textMuted}`}>
                    {t('organizations.channelRolePermScopeNote', { channel: channelLabel })}
                  </p>

                  {permGroups.map((group) => (
                    <section key={group.id} className="mb-6">
                      <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-[#949ba4]">
                        {group.title}
                      </h3>
                      <div className="space-y-4">
                        {group.items.map((item) => (
                          <div
                            key={item.id}
                            className={`flex items-start justify-between gap-4 border-b pb-4 ${
                              isDarkMode ? 'border-[#3f4147]/60' : 'border-slate-100'
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-semibold">{item.title}</div>
                              <p className={`mt-1 text-xs leading-relaxed ${textMuted}`}>
                                {item.description}
                              </p>
                            </div>
                            <ChannelPermissionTriToggle
                              allowed={Boolean(selectedRole.permissions[item.key])}
                              onChange={(v) => setSelectedPerm(item.key, v)}
                              isDarkMode={isDarkMode}
                              disabled={!canManageChannelRoles}
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

            {deleteConfirm ? (
              <div
                className={`shrink-0 border-t px-4 py-2.5 text-xs ${borderCls} ${
                  isDarkMode ? 'bg-rose-950/30 text-[#fca5a5]' : 'bg-rose-50 text-rose-700'
                }`}
              >
                {t('organizations.deleteChannelMsg')}
              </div>
            ) : null}

            <footer
              className={`flex shrink-0 items-center justify-between gap-3 border-t px-4 py-3 ${borderCls}`}
            >
              <div className="min-w-0 shrink-0">
                {canManageChannelRoles ? (
                  channelProtected ? (
                    <span
                      className={`text-xs ${textMuted}`}
                      title={t('organizations.deleteChannelProtected')}
                    >
                      {t('organizations.deleteChannelProtected')}
                    </span>
                  ) : deleteConfirm ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={deleting}
                        onClick={() => setDeleteConfirm(false)}
                        className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                          isDarkMode
                            ? 'bg-white/10 text-white hover:bg-white/15'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {t('nav.cancel')}
                      </button>
                      <button
                        type="button"
                        disabled={deleting || !onDeleteChannel}
                        onClick={handleConfirmDelete}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                        {deleting ? t('organizationSettings.deleting') : t('common.delete')}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setDeleteConfirm(true)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-rose-600/40 bg-rose-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-rose-700"
                    >
                      <Trash2 className="h-4 w-4" />
                      {t('organizations.deleteChannelBtn')}
                    </button>
                  )
                ) : null}
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                    isDarkMode
                      ? 'bg-white/10 text-white hover:bg-white/15'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {t('nav.cancel')}
                </button>
                <button
                  type="button"
                  disabled={saving || loading || deleting}
                  onClick={handleSave}
                  className="rounded-lg bg-[#5865f2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#4752c4] disabled:opacity-50"
                >
                  {saving ? t('organizations.saving') : t('organizations.saveChanges')}
                </button>
              </div>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
