import { useEffect, useMemo, useState } from 'react';
import Modal from '../../Shared/Modal';
import { useAppStrings } from '../../../locales/appStrings';
import projectAPI from '../../../services/api/projectAPI';
import { resolveApiErrorMessage } from '../../../utils/resolveApiErrorMessage';

export default function ProjectHubCompleteSprintModal({
  isOpen,
  projectId,
  sprint,
  canManageSprints = false,
  onClose,
  onCompleted,
}) {
  const { t } = useAppStrings();
  const sprintId = useMemo(() => (sprint?._id ? String(sprint._id) : ''), [sprint?._id]);

  const inputCls =
    'mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary';

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);

  const [incompleteAction, setIncompleteAction] = useState('backlog');
  const [targetSprintId, setTargetSprintId] = useState('');

  const loadPreview = async () => {
    if (!projectId || !sprintId) return;
    setLoading(true);
    setError('');
    try {
      const res = await projectAPI.completeSprintPreview(projectId, sprintId);
      const payload = res?.data ?? res;
      setPreview(payload?.data ?? payload);
    } catch (err) {
      setPreview(null);
      setError(resolveApiErrorMessage(err, { t, fallback: t('workspace.projectHubPlanCompleteSprintError') }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !sprintId) return undefined;

    // Reset form on open/sprint switch.
    setPreview(null);
    setError('');
    setIncompleteAction('backlog');
    setTargetSprintId('');

    let mounted = true;
    (async () => {
      if (!mounted) return;
      await loadPreview();
    })();

    return () => {
      mounted = false;
    };
  }, [isOpen, sprintId]);

  const incompleteCount = Number(preview?.incompleteCount || 0);
  const destinationSprints = Array.isArray(preview?.destinationSprints) ? preview.destinationSprints : [];
  const isLastSprint = Boolean(preview?.isLastSprint);
  const lastSprintBlocked = isLastSprint && incompleteCount > 0;

  const canMoveToSprint = incompleteAction === 'sprint';
  const canSubmit =
    canManageSprints &&
    !loading &&
    !submitting &&
    sprintId &&
    !lastSprintBlocked &&
    (!incompleteCount || incompleteCount === 0
      ? true
      : incompleteAction === 'backlog'
        ? true
        : Boolean(targetSprintId));

  const onRetry = () => loadPreview();

  const submitComplete = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const body = {};
      if (incompleteCount > 0) {
        if (incompleteAction === 'backlog') {
          body.incompleteAction = 'backlog';
          body.targetSprintId = null;
        } else if (incompleteAction === 'sprint') {
          body.incompleteAction = 'sprint';
          body.targetSprintId = targetSprintId || null;
        }
      }

      const res = await projectAPI.completeSprint(projectId, sprintId, body);
      const payload = res?.data ?? res;
      await onCompleted?.(payload?.data ?? payload);
      onClose?.();
    } catch (err) {
      setError(resolveApiErrorMessage(err, { t, fallback: t('workspace.projectHubPlanCompleteSprintError') }));
    } finally {
      setSubmitting(false);
    }
  };

  const previewSummary = (() => {
    if (!preview) return null;
    if (lastSprintBlocked) {
      return (
        <p className="text-sm text-muted-foreground">
          {t('workspace.projectHubPlanCompleteSprintLastIncomplete', { n: incompleteCount })}
        </p>
      );
    }
    if (incompleteCount > 0) {
      return (
        <p className="text-sm text-muted-foreground">
          {t('workspace.projectHubPlanCompleteSprintSummaryIncomplete', { n: incompleteCount })}
        </p>
      );
    }
    return <p className="text-sm text-muted-foreground">{t('workspace.projectHubPlanCompleteSprintSummaryAllDone')}</p>;
  })();

  return (
    <Modal isOpen={Boolean(isOpen)} onClose={onClose} title={t('workspace.projectHubPlanCompleteSprintModalTitle')} size="md">
      {loading ? (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{t('common.loading')}</p>
          <div className="h-10 rounded-lg border border-border bg-muted/20" />
        </div>
      ) : error ? (
        <div className="space-y-3">
          <p className="text-sm text-destructive">{error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg border border-border px-3 py-2 text-sm font-semibold text-foreground disabled:opacity-50"
            disabled={submitting}
          >
            {t('workspace.projectHubPlanCompleteSprintRetry')}
          </button>
        </div>
      ) : !preview ? (
        <div className="text-sm text-muted-foreground">{t('common.loading')}</div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground">{sprint?.name}</p>
            {previewSummary}
          </div>

          {incompleteCount > 0 && !lastSprintBlocked ? (
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-muted-foreground">
                {t('workspace.projectHubPlanCompleteSprintActionBacklog')}
              </label>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setIncompleteAction('backlog')}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm font-semibold ${
                    incompleteAction === 'backlog' ? 'border-primary bg-primary/10' : 'border-border bg-background'
                  }`}
                  aria-pressed={incompleteAction === 'backlog'}
                >
                  <input type="radio" checked={incompleteAction === 'backlog'} readOnly aria-hidden />
                  <span>{t('workspace.projectHubPlanCompleteSprintActionBacklog')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIncompleteAction('sprint')}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm font-semibold ${
                    incompleteAction === 'sprint' ? 'border-primary bg-primary/10' : 'border-border bg-background'
                  }`}
                  aria-pressed={incompleteAction === 'sprint'}
                >
                  <input type="radio" checked={incompleteAction === 'sprint'} readOnly aria-hidden />
                  <span>{t('workspace.projectHubPlanCompleteSprintActionSprint')}</span>
                </button>
              </div>

              {canMoveToSprint ? (
                <label className="block text-xs font-semibold text-muted-foreground">
                  {t('workspace.projectHubPlanCompleteSprintTargetSprintPh')}
                  <select
                    className={inputCls}
                    value={targetSprintId}
                    onChange={(e) => setTargetSprintId(String(e.target.value))}
                  >
                    <option value="" disabled>
                      {t('workspace.projectHubPlanCompleteSprintTargetSprintPh')}
                    </option>
                    {destinationSprints.map((s) => (
                      <option key={s.sprintId} value={s.sprintId}>
                        {s.name || s.sprintId}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground">
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={submitComplete}
              disabled={!canSubmit}
              className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {t('workspace.projectHubPlanCompleteSprintCompleteBtn')}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

