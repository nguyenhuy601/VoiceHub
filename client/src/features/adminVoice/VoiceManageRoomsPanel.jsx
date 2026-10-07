import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ConfirmDialog, GradientButton } from '../../components/Shared';
import { adminInputClass, adminPrimaryBtnClass } from '../../components/adminUsers/adminUserPanelUi';
import { organizationAPI } from '../../services/api/organizationAPI';
import useAdminVoiceRooms from '../../hooks/useAdminVoiceRooms';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';

const ROOM_NAME_MAX_LENGTH = 100;

export default function VoiceManageRoomsPanel({ orgId }) {
  const { t } = useAppStrings();
  const { voiceRooms, loading, error, loadRooms, structure } = useAdminVoiceRooms(orgId);
  const [searchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState(() => String(searchParams.get('roomId') || '').trim());
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDeptId, setCreateDeptId] = useState('');
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const departments = useMemo(() => {
    const list = [];
    for (const branch of structure?.branches || []) {
      for (const division of branch?.divisions || []) {
        for (const department of division?.departments || []) {
          list.push({
            id: String(department._id || department.id),
            name: department.name || 'Department',
          });
        }
      }
    }
    for (const department of structure?.departments || []) {
      list.push({
        id: String(department._id || department.id),
        name: department.name || 'Department',
      });
    }
    return list;
  }, [structure]);

  const selected = voiceRooms.find((ch) => String(ch._id || ch.id) === selectedId);
  const selectedName = selected?.name || '';

  useEffect(() => {
    if (selectedName) setName((current) => current || selectedName);
  }, [selectedName]);

  const selectRoom = (ch) => {
    const id = String(ch._id || ch.id);
    setSelectedId(id);
    setName(ch.name || '');
  };

  const saveRename = async () => {
    if (!orgId || !selected || !name.trim() || busy) return;
    const deptId = String(selected.department || selected.departmentId || '').trim();
    const channelId = String(selected._id || selected.id);
    setBusy(true);
    try {
      if (deptId) {
        await organizationAPI.updateChannel(orgId, deptId, channelId, { name: name.trim() });
      } else {
        await organizationAPI.updateChannelByScope(orgId, channelId, { name: name.trim() });
      }
      toast.success(t('adminVoice.roomSaved'));
      await loadRooms();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminVoice.roomSaveFail') }));
    } finally {
      setBusy(false);
    }
  };

  const createRoom = async () => {
    if (!orgId || !createName.trim() || !createDeptId || busy) return;
    setBusy(true);
    try {
      await organizationAPI.createChannel(orgId, createDeptId, {
        name: createName.trim(),
        type: 'voice',
      });
      toast.success(t('adminVoice.roomCreated'));
      setCreateName('');
      await loadRooms();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminVoice.roomCreateFail') }));
    } finally {
      setBusy(false);
    }
  };

  const deleteRoom = async () => {
    if (!orgId || !selected || busy) return;
    const channelId = String(selected._id || selected.id);
    const deptId = String(selected.department || selected.departmentId || '').trim();
    setBusy(true);
    try {
      if (deptId) {
        await organizationAPI.deleteChannel(orgId, deptId, channelId);
      } else {
        await organizationAPI.deleteChannelByScope(orgId, channelId);
      }
      toast.success(t('adminVoice.roomDeleted'));
      setSelectedId('');
      setName('');
      await loadRooms();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminVoice.roomDeleteFail') }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{t('adminDomains.voice.manageRooms')}</h2>
        <p className="text-sm text-muted-foreground">{t('adminVoice.manageRoomsHint')}</p>
      </div>

      {error ? (
        <div className="space-y-3 rounded-xl border border-destructive px-3 py-4">
          <p className="text-sm text-destructive">{error}</p>
          <button type="button" className={adminPrimaryBtnClass()} onClick={() => loadRooms()}>
            {t('common.retry')}
          </button>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="mb-2 text-sm font-medium">{t('adminVoice.createRoom')}</p>
            <div className="space-y-2">
              <select
                className={adminInputClass()}
                value={createDeptId}
                onChange={(e) => setCreateDeptId(e.target.value)}
                aria-label={t('adminVoice.departmentAria')}
                disabled={busy}
              >
                <option value="">{t('adminVoice.selectDepartment')}</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <input
                className={adminInputClass()}
                placeholder={t('adminVoice.roomNamePlaceholder')}
                aria-label={t('adminVoice.roomNamePlaceholder')}
                value={createName}
                maxLength={ROOM_NAME_MAX_LENGTH}
                onChange={(e) => setCreateName(e.target.value)}
                disabled={busy}
              />
              <GradientButton type="button" disabled={busy || !createDeptId || !createName.trim()} onClick={createRoom}>
                {t('adminVoice.createRoom')}
              </GradientButton>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <p className="mb-2 text-sm font-medium">{t('adminVoice.renameRoom')}</p>
            {loading ? (
              <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
            ) : !voiceRooms.length ? (
              <p className="mb-3 rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                {t('adminVoice.noRooms')}
              </p>
            ) : (
              <ul className="mb-3 max-h-40 space-y-1 overflow-auto text-sm">
                {voiceRooms.map((ch) => {
                  const id = String(ch._id || ch.id);
                  const isSelected = selectedId === id;
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        aria-pressed={isSelected}
                        className={`w-full rounded-md px-2 py-1.5 text-left transition-colors duration-150 motion-reduce:transition-none ${
                          isSelected ? 'bg-primary-subtle text-primary' : 'hover:bg-muted'
                        }`}
                        onClick={() => selectRoom(ch)}
                      >
                        {ch.name}
                        {ch._scopeName ? (
                          <span className="ml-2 text-xs text-muted-foreground">· {ch._scopeName}</span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {selected ? (
              <div className="space-y-2">
                <input
                  className={adminInputClass()}
                  aria-label={t('adminVoice.renameRoom')}
                  value={name}
                  maxLength={ROOM_NAME_MAX_LENGTH}
                  onChange={(e) => setName(e.target.value)}
                  disabled={busy}
                />
                <div className="flex flex-wrap gap-2">
                  <GradientButton type="button" disabled={busy || !name.trim()} onClick={saveRename}>
                    {busy ? t('common.saving') : t('common.save')}
                  </GradientButton>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirmDeleteOpen(true)}
                    className="rounded-lg border border-destructive px-3 py-2 text-sm text-destructive transition-colors duration-150 hover:bg-muted disabled:opacity-50 motion-reduce:transition-none"
                  >
                    {t('adminVoice.deleteRoom')}
                  </button>
                </div>
              </div>
            ) : voiceRooms.length ? (
              <p className="text-sm text-muted-foreground">{t('adminVoice.selectRoomFirst')}</p>
            ) : null}
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        onConfirm={deleteRoom}
        variant="danger"
        title={t('adminTasks.confirmTitle')}
        message={t('adminVoice.deleteRoomConfirm', { name: selected?.name || selectedId })}
        confirmText={t('adminVoice.deleteRoom')}
        cancelText={t('common.cancel')}
      />
    </div>
  );
}
