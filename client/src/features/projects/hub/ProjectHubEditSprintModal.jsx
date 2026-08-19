import { useEffect, useState } from 'react';
import Modal from '../../../components/Shared/Modal';
import { addDaysToDateTimeLocal, isSprintDateRangeInvalid, toDateTimeLocalValue } from './projectHubUtils';

/**
 * Modal sửa sprint: name, duration, start/end, goal.
 */
export default function ProjectHubEditSprintModal({
  isOpen,
  sprint = null,
  busy = false,
  canDelete = false,
  onClose,
  onSave,
  onDelete,
  t,
}) {
  const [name, setName] = useState('');
  const [duration, setDuration] = useState('custom');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [goal, setGoal] = useState('');

  useEffect(() => {
    if (!isOpen || !sprint) return;
    setName(String(sprint.name || ''));
    setGoal(String(sprint.goal || ''));
    setStartDate(toDateTimeLocalValue(sprint.startDate));
    setEndDate(toDateTimeLocalValue(sprint.endDate));
    setDuration('custom');
  }, [isOpen, sprint]);

  const applyDuration = (nextDuration, nextStart = startDate) => {
    setDuration(nextDuration);
    if (nextDuration === '1w') setEndDate(addDaysToDateTimeLocal(nextStart || new Date().toISOString(), 7));
    if (nextDuration === '2w') setEndDate(addDaysToDateTimeLocal(nextStart || new Date().toISOString(), 14));
  };

  const datesInvalid = isSprintDateRangeInvalid(startDate, endDate);
  const canSave = Boolean(name.trim()) && !datesInvalid;

  const inputCls =
    'mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('workspace.projectHubBacklogEditSprintTitle', { name: sprint?.name || '' })}
      size="md"
    >
      <p className="mb-3 text-xs text-muted-foreground">{t('workspace.projectHubBacklogRequiredHint')}</p>
      <label className="mb-3 block text-xs font-semibold">
        {t('workspace.projectHubBacklogSprintName')} *
        <input
          className={inputCls}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </label>
      <label className="mb-3 block text-xs font-semibold">
        {t('workspace.projectHubBacklogSprintDuration')}
        <select
          className={inputCls}
          value={duration}
          onChange={(e) => applyDuration(e.target.value)}
        >
          <option value="1w">{t('workspace.projectHubBacklogDuration1w')}</option>
          <option value="2w">{t('workspace.projectHubBacklogDuration2w')}</option>
          <option value="custom">{t('workspace.projectHubBacklogDurationCustom')}</option>
        </select>
      </label>
      <label className="mb-3 block text-xs font-semibold">
        {t('workspace.projectHubBacklogStartDate')}
        <input
          type="datetime-local"
          className={inputCls}
          value={startDate}
          onChange={(e) => {
            const v = e.target.value;
            setStartDate(v);
            if (duration === '1w' || duration === '2w') applyDuration(duration, v);
          }}
        />
      </label>
      <label className="mb-3 block text-xs font-semibold">
        {t('workspace.projectHubBacklogEndDate')}
        <input
          type="datetime-local"
          className={inputCls}
          value={endDate}
          onChange={(e) => {
            setDuration('custom');
            setEndDate(e.target.value);
          }}
        />
      </label>
      {datesInvalid ? (
        <p className="mb-3 text-xs text-destructive">{t('workspace.projectHubSprintDatesInvalid')}</p>
      ) : null}
      <label className="mb-4 block text-xs font-semibold">
        {t('workspace.projectHubBacklogSprintGoal')}
        <textarea className={`${inputCls} min-h-[80px]`} value={goal} onChange={(e) => setGoal(e.target.value)} />
      </label>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {canDelete ? (
          <button
            type="button"
            disabled={busy}
            onClick={onDelete}
            className="mr-auto rounded-lg px-3 py-2 text-sm font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50"
          >
            {t('workspace.projectHubBacklogDeleteSprint')}
          </button>
        ) : null}
        <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground">
          {t('common.cancel')}
        </button>
        <button
          type="button"
          disabled={busy || !canSave}
          onClick={() =>
            onSave?.({
              name: name.trim(),
              goal,
              startDate: startDate ? new Date(startDate).toISOString() : null,
              endDate: endDate ? new Date(endDate).toISOString() : null,
            })
          }
          className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {t('workspace.projectHubBacklogUpdate')}
        </button>
      </div>
    </Modal>
  );
}
