import { useCallback, useEffect, useId, useState } from 'react';
import toast from 'react-hot-toast';
import { ChevronRight } from 'lucide-react';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminInputClass,
  adminLabelClass,
  adminPrimaryBtnClass,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import {
  AdminBusySpinner,
  AdminListSkeleton,
  AdminLoadErrorState,
} from '../../components/adminUsers/adminPanelStates';
import { useAppStrings } from '../../locales/appStrings';
import { projectAPI } from '../../services/api/projectAPI';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';

/** Khớp bound của project-service governance.service (updateRetentionPolicy). */
const ARCHIVE_AFTER_RANGE = { min: 0, max: 3650 };
const DEFAULT_RETENTION_RANGE = { min: 1, max: 3650 };
const NOTES_MAX_LENGTH = 1000;

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

function isIntegerInRange(raw, { min, max }) {
  const text = String(raw).trim();
  if (!/^\d+$/.test(text)) return false;
  const value = Number(text);
  return value >= min && value <= max;
}

function DaysField({ id, label, value, onChange, range, error }) {
  const errorId = `${id}-error`;
  return (
    <div className="mb-3">
      <label htmlFor={id} className={adminLabelClass()}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={range.min}
        max={range.max}
        step={1}
        className={adminInputClass(error ? 'border-destructive' : '')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      />
      {error ? (
        <p id={errorId} className="mt-1 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Retention policy + stub job (Phase 6 Wave B).
 */
export default function RetentionPolicyPanel({ orgId, embedded = false }) {
  const { t } = useAppStrings();
  const fieldId = useId();
  const [settings, setSettings] = useState(null);
  const [archivedCount, setArchivedCount] = useState(0);
  const [archiveInactiveAfterDays, setArchiveInactiveAfterDays] = useState('90');
  const [defaultRetentionDays, setDefaultRetentionDays] = useState('365');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [runningStub, setRunningStub] = useState(false);
  const [stubResult, setStubResult] = useState(null);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setLoadError('');
    try {
      const res = await projectAPI.getRetentionPolicy(orgId);
      const data = unwrap(res);
      const s = data?.settings || {};
      setSettings(s);
      setArchivedCount(Number(data?.archivedCount || 0));
      setArchiveInactiveAfterDays(String(s.archiveInactiveAfterDays ?? 90));
      setDefaultRetentionDays(String(s.defaultRetentionDays ?? 365));
      setNotes(String(s.notes || ''));
    } catch (error) {
      setLoadError(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.retentionLoadFail') }));
    } finally {
      setLoading(false);
    }
  }, [orgId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const archiveError = isIntegerInRange(archiveInactiveAfterDays, ARCHIVE_AFTER_RANGE)
    ? ''
    : t('adminTasks.retentionRangeError', ARCHIVE_AFTER_RANGE);
  const defaultError = isIntegerInRange(defaultRetentionDays, DEFAULT_RETENTION_RANGE)
    ? ''
    : t('adminTasks.retentionRangeError', DEFAULT_RETENTION_RANGE);
  const hasFieldError = Boolean(archiveError || defaultError);

  const save = async () => {
    if (hasFieldError) return;
    setSaving(true);
    try {
      await projectAPI.updateRetentionPolicy(orgId, {
        archiveInactiveAfterDays: Number(archiveInactiveAfterDays),
        defaultRetentionDays: Number(defaultRetentionDays),
        notes,
      });
      toast.success(t('adminTasks.retentionSaved'));
      await load();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.retentionSaveFail') }));
    } finally {
      setSaving(false);
    }
  };

  const runStub = async () => {
    setRunningStub(true);
    try {
      const res = await projectAPI.runRetentionStub(orgId, { dryRun: true });
      setStubResult(unwrap(res));
      toast.success(t('adminTasks.retentionStubOk'));
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.retentionStubFail') }));
    } finally {
      setRunningStub(false);
    }
  };

  const candidates = Array.isArray(stubResult?.candidates) ? stubResult.candidates : [];
  const expiredCount = candidates.filter((c) => c?.expired).length;

  let body;
  if (loading && !settings) {
    body = <AdminListSkeleton rows={3} />;
  } else if (loadError && !settings) {
    body = <AdminLoadErrorState message={loadError} onRetry={load} disabled={loading} />;
  } else {
    body = (
      <div className="grid gap-4 lg:grid-cols-2">
        <AdminUserFormCard title={t('adminTasks.retentionPolicyTitle')}>
          <DaysField
            id={`${fieldId}-archive`}
            label={t('adminTasks.retentionArchiveAfterLabel')}
            value={archiveInactiveAfterDays}
            onChange={setArchiveInactiveAfterDays}
            range={ARCHIVE_AFTER_RANGE}
            error={archiveError}
          />
          <DaysField
            id={`${fieldId}-default`}
            label={t('adminTasks.retentionDefaultDaysLabel')}
            value={defaultRetentionDays}
            onChange={setDefaultRetentionDays}
            range={DEFAULT_RETENTION_RANGE}
            error={defaultError}
          />
          <div className="mb-3">
            <label htmlFor={`${fieldId}-notes`} className={adminLabelClass()}>
              {t('adminTasks.retentionNotesLabel')}
            </label>
            <textarea
              id={`${fieldId}-notes`}
              className={adminInputClass()}
              rows={3}
              maxLength={NOTES_MAX_LENGTH}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              aria-describedby={`${fieldId}-notes-count`}
            />
            <p id={`${fieldId}-notes-count`} className="mt-1 text-right text-xs text-muted-foreground">
              {t('adminTasks.retentionNotesCount', { n: notes.length, max: NOTES_MAX_LENGTH })}
            </p>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            {t('adminTasks.retentionArchivedCount', { n: archivedCount })}
          </p>
          <button
            type="button"
            className={adminPrimaryBtnClass()}
            disabled={saving || hasFieldError}
            aria-busy={saving}
            onClick={save}
          >
            <AdminBusySpinner busy={saving} />
            {t('common.save')}
          </button>
        </AdminUserFormCard>

        <AdminUserFormCard title={t('adminTasks.retentionStubTitle')}>
          <p className="mb-3 text-xs text-muted-foreground">{t('adminTasks.retentionStubHint')}</p>
          <button
            type="button"
            className={adminSecondaryBtnClass()}
            disabled={runningStub}
            aria-busy={runningStub}
            onClick={runStub}
          >
            <AdminBusySpinner busy={runningStub} />
            {t('adminTasks.retentionRunStub')}
          </button>
          {stubResult ? (
            <details className="group mt-3 rounded-lg border border-border bg-muted p-3">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <ChevronRight
                  size={16}
                  className="shrink-0 transition-transform duration-150 group-open:rotate-90 motion-reduce:transition-none"
                  aria-hidden
                />
                {t('adminTasks.retentionStubSummary', { total: candidates.length, expired: expiredCount })}
              </summary>
              <pre className="mt-3 max-h-48 overflow-auto rounded bg-background p-2 text-[11px] text-muted-foreground">
                {JSON.stringify(stubResult, null, 2)}
              </pre>
            </details>
          ) : null}
        </AdminUserFormCard>
      </div>
    );
  }

  if (embedded) return body;

  return (
    <AdminUserPanelShell title={t('adminDomains.systemConfig.retention')} hint={t('adminTasks.retentionHint')} wide>
      {body}
    </AdminUserPanelShell>
  );
}
