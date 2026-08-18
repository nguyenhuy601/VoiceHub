import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { GradientButton } from '../../components/Shared';
import { adminPrimaryBtnClass } from '../../components/adminUsers/adminUserPanelUi';
import { organizationAPI } from '../../services/api/organizationAPI';
import useAdminVoiceRooms from '../../hooks/useAdminVoiceRooms';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';

export default function VoiceManageRoomsPanel({ orgId }) {
  const { t } = useAppStrings();
  const { voiceRooms, loading, error, loadRooms, structure } = useAdminVoiceRooms(orgId);
  const [selectedId, setSelectedId] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDeptId, setCreateDeptId] = useState('');

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
    const roomName = selected.name || channelId;
    if (!window.confirm(t('adminVoice.deleteRoomConfirm', { name: roomName }))) return;
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
        <div className="space-y-3 rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-4">
          <p className="text-sm text-destructive">{error}</p>
          <button type="button" className={adminPrimaryBtnClass()} onClick={() => loadRooms()}>
            {t('adminRbac.retry')}
          </button>
        </div>
      ) : (
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card/40 p-4">
          <p className="mb-2 text-sm font-medium">{t('adminVoice.createRoom')}</p>
          <div className="space-y-2">
            <select
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={createDeptId}
              onChange={(e) => setCreateDeptId(e.target.value)}
            >
              <option value="">{t('adminVoice.selectDepartment')}</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <input
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              placeholder={t('adminVoice.roomNamePlaceholder')}
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
            />
            <GradientButton type="button" disabled={busy || !createDeptId || !createName.trim()} onClick={createRoom}>
              {t('adminVoice.createRoom')}
            </GradientButton>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card/40 p-4">
          <p className="mb-2 text-sm font-medium">{t('adminVoice.renameRoom')}</p>
          {loading ? (
            <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
          ) : (
            <ul className="mb-3 max-h-40 space-y-1 overflow-auto text-sm">
              {voiceRooms.map((ch) => {
                const id = String(ch._id || ch.id);
                return (
                  <li key={id}>
                    <button
                      type="button"
                      className={`w-full rounded-md px-2 py-1.5 text-left ${selectedId === id ? 'bg-red-500/10' : 'hover:bg-muted/40'}`}
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
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <GradientButton type="button" disabled={busy || !name.trim()} onClick={saveRename}>
                  {busy ? t('common.saving') : t('common.save')}
                </GradientButton>
                <button
                  type="button"
                  disabled={busy}
                  onClick={deleteRoom}
                  className="rounded-lg border border-red-500/40 px-3 py-2 text-sm text-red-600 hover:bg-red-500/10 dark:text-red-300"
                >
                  {t('adminVoice.deleteRoom')}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t('adminVoice.selectRoomFirst')}</p>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
