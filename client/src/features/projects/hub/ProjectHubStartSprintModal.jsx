import { useEffect, useState } from 'react';
import Modal from '../../../components/Shared/Modal';
import {
  applySprintDuration,
  defaultSprintDateRange,
  isSprintDateRangeInvalid,
  toDateTimeLocalValue,
} from './projectHubUtils';

/**
 * Modal Start Sprint: sprintName, duration, start/end, autoComplete, sprintGoal.
 * duration fixed → endDate disabled; custom → unlock endDate.
 */
export default function ProjectHubStartSprintModal({
  isOpen,
  sprint = null,
  workItemCount = 0,
  busy = false,
  onClose,
  onStart,
  t,
}) {
  const [sprintName, setSprintName] = useState('');
  const [duration, setDuration] = useState('2w');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [autoComplete, setAutoComplete] = useState(false);
  const [sprintGoal, setSprintGoal] = useState('');

  useEffect(() => {
    if (!isOpen || !sprint) return;
    setSprintName(String(sprint.name || ''));
    setSprintGoal(String(sprint.goal || ''));
    setAutoComplete(Boolean(sprint.autoComplete));

    const defaults = defaultSprintDateRange(sprint);
    const startLocal = defaults.error
      ? toDateTimeLocalValue(new Date())
      : toDateTimeLocalValue(defaults.startDate);
    const applied = applySprintDuration('2w', startLocal, '');
    setDuration(applied.duration);
    setStartDate(startLocal);
    setEndDate(applied.endDate);
  }, [isOpen, sprint]);

  const onDurationChange = (nextDuration) => {
    const applied = applySprintDuration(nextDuration, startDate, endDate);
    setDuration(applied.duration);
    setEndDate(applied.endDate);
  };

  const onStartDateChange = (value) => {
    setStartDate(value);
    if (duration !== 'custom') {
      const applied = applySprintDuration(duration, value, endDate);
      setEndDate(applied.endDate);
    }
  };

  const datesInvalid = isSprintDateRangeInvalid(startDate, endDate);
  const canSubmit = Boolean(sprintName.trim()) && Boolean(startDate) && Boolean(endDate) && !datesInvalid;
  const endDateLocked = duration !== 'custom';

  const inputCls =
    'mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary';
  const inputDisabledCls = `${inputCls} opacity-60 cursor-not-allowed`;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('workspace.projectHubStartSprintModalTitle')}
      size="md"
    >
      <p className="mb-1 text-sm text-foreground">
        {t('workspace.projectHubStartSprintWorkItems', { n: Number(workItemCount) || 0 })}
      </p>
      <p className="mb-3 text-xs text-muted-foreground">{t('workspace.projectHubBacklogRequiredHint')}</p>

      <label className="mb-3 block text-xs font-semibold">
        {t('workspace.projectHubBacklogSprintName')} *
        <input
          className={inputCls}
          value={sprintName}
          onChange={(e) => setSprintName(e.target.value)}
          required
        />
      </label>

      <label className="mb-3 block text-xs font-semibold">
        {t('workspace.projectHubBacklogSprintDuration')} *
        <select
          className={inputCls}
          value={duration}
          onChange={(e) => onDurationChange(e.target.value)}
        >
          <option value="1w">{t('workspace.projectHubBacklogDuration1w')}</option>
          <option value="2w">{t('workspace.projectHubBacklogDuration2w')}</option>
          <option value="3w">{t('workspace.projectHubBacklogDuration3w')}</option>
          <option value="4w">{t('workspace.projectHubBacklogDuration4w')}</option>
          <option value="custom">{t('workspace.projectHubBacklogDurationCustom')}</option>
        </select>
      </label>

      <label className="mb-1 block text-xs font-semibold">
        {t('workspace.projectHubBacklogStartDate')} *
        <input
          type="datetime-local"
          className={inputCls}
          value={startDate}
          onChange={(e) => onStartDateChange(e.target.value)}
          required
        />
      </label>
      <p className="mb-3 text-[11px] text-muted-foreground">
        {t('workspace.projectHubStartSprintDateFormatHint')}
      </p>

      <label className="mb-3 block text-xs font-semibold">
        {t('workspace.projectHubBacklogEndDate')} *
        <input
          type="datetime-local"
          className={endDateLocked ? inputDisabledCls : inputCls}
          value={endDate}
          disabled={endDateLocked}
          onChange={(e) => {
            setDuration('custom');
            setEndDate(e.target.value);
          }}
          required
        />
      </label>

      {datesInvalid ? (
        <p className="mb-3 text-xs text-destructive">{t('workspace.projectHubSprintDatesInvalid')}</p>
      ) : null}

      <label className="mb-4 flex cursor-pointer items-center gap-3 text-sm font-medium">
        <button
          type="button"
          role="switch"
          aria-checked={autoComplete}
          onClick={() => setAutoComplete((v) => !v)}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
            autoComplete ? 'bg-primary' : 'bg-muted'
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-background shadow transition-transform ${
              autoComplete ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
        <span>{t('workspace.projectHubStartSprintAutoComplete')}</span>
      </label>

      <label className="mb-4 block text-xs font-semibold">
        {t('workspace.projectHubBacklogSprintGoal')}
        <textarea
          className={`${inputCls} min-h-[80px]`}
          value={sprintGoal}
          onChange={(e) => setSprintGoal(e.target.value)}
        />
      </label>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground"
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          disabled={busy || !canSubmit}
          onClick={() =>
            onStart?.({
              sprintName: sprintName.trim(),
              duration,
              startDate: startDate ? new Date(startDate).toISOString() : null,
              endDate: endDate ? new Date(endDate).toISOString() : null,
              autoComplete: Boolean(autoComplete),
              sprintGoal,
            })
          }
          className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {t('workspace.projectHubStartSprintConfirm')}
        </button>
      </div>
    </Modal>
  );
}
