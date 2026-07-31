import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminInputClass,
  adminLabelClass,
  adminPrimaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { taskAPI } from '../../services/api/taskAPI';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import AdminTaskBoardPicker from './AdminTaskBoardPicker';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

function toDateInput(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

export default function TasksProjectSettingsPanel({ orgId }) {
  const { t } = useAppStrings();
  const [params, setParams] = useSearchParams();
  const boardId = String(params.get('boardId') || '').trim();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [projectCode, setProjectCode] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState('private');
  const [dueDate, setDueDate] = useState('');
  const [background, setBackground] = useState('');

  const setBoardId = (id) => {
    const next = new URLSearchParams(params);
    if (id) next.set('boardId', id);
    else next.delete('boardId');
    setParams(next, { replace: true });
  };

  const load = useCallback(async () => {
    if (!boardId) {
      setTitle('');
      setProjectCode('');
      setDescription('');
      setVisibility('private');
      setDueDate('');
      setBackground('');
      return;
    }
    setLoading(true);
    try {
      const res = await taskAPI.getBoardDetail(boardId, { organizationId: orgId });
      const data = unwrap(res);
      const board = data?.board || data;
      setTitle(String(board?.title || ''));
      setProjectCode(String(board?.projectCode || ''));
      setDescription(String(board?.description || ''));
      setVisibility(board?.visibility === 'workspace' ? 'workspace' : 'private');
      setDueDate(toDateInput(board?.dueDate));
      setBackground(String(board?.background || ''));
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.settingsLoadFail') }));
    } finally {
      setLoading(false);
    }
  }, [boardId, orgId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (e) => {
    e.preventDefault();
    if (!boardId || saving || !title.trim()) return;
    setSaving(true);
    try {
      await taskAPI.patchBoard(
        boardId,
        {
          title: title.trim(),
          projectCode: projectCode.trim(),
          description,
          visibility,
          dueDate: dueDate || null,
          background,
        },
        { organizationId: orgId }
      );
      toast.success(t('adminTasks.settingsSaved'));
      await load();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.settingsSaveFail') }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminUserPanelShell
      title={t('adminDomains.projects.settings')}
      hint={t('adminTasks.settingsHint')}
      wide
    >
      <AdminTaskBoardPicker orgId={orgId} boardId={boardId} onBoardIdChange={setBoardId} />

      {!boardId ? (
        <p className="text-sm text-muted-foreground">{t('adminTasks.needBoard')}</p>
      ) : loading ? (
        <p className="text-sm text-muted-foreground">{t('adminTasks.loading')}</p>
      ) : (
        <AdminUserFormCard title={t('adminDomains.projects.settings')}>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={save}>
            <label className={adminLabelClass()}>
              {t('adminTasks.settingsTitle')}
              <input
                className={adminInputClass()}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </label>
            <label className={adminLabelClass()}>
              {t('adminTasks.settingsCode')}
              <input
                className={adminInputClass()}
                value={projectCode}
                onChange={(e) => setProjectCode(e.target.value)}
              />
            </label>
            <label className={`${adminLabelClass()} sm:col-span-2`}>
              {t('adminTasks.settingsDescription')}
              <textarea
                className={adminInputClass()}
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <label className={adminLabelClass()}>
              {t('adminTasks.settingsVisibility')}
              <select
                className={adminInputClass()}
                value={visibility}
                onChange={(e) => setVisibility(e.target.value)}
              >
                <option value="private">{t('adminTasks.settingsVisibilityPrivate')}</option>
                <option value="workspace">{t('adminTasks.settingsVisibilityWorkspace')}</option>
              </select>
            </label>
            <label className={adminLabelClass()}>
              {t('adminTasks.settingsDueDate')}
              <input
                type="date"
                className={adminInputClass()}
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </label>
            <label className={`${adminLabelClass()} sm:col-span-2`}>
              {t('adminTasks.settingsBackground')}
              <input
                className={adminInputClass()}
                value={background}
                onChange={(e) => setBackground(e.target.value)}
              />
            </label>
            <div className="sm:col-span-2">
              <button type="submit" className={adminPrimaryBtnClass()} disabled={saving || !title.trim()}>
                {saving ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </form>
        </AdminUserFormCard>
      )}
    </AdminUserPanelShell>
  );
}
