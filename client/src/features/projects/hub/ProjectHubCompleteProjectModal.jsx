import { useEffect, useMemo, useState } from 'react';
import Modal from '../../../components/Shared/Modal';
import { useAppStrings } from '../../../locales/appStrings';
import projectAPI from '../../../services/api/projectAPI';
import { resolveApiErrorMessage } from '../../../utils/resolveApiErrorMessage';

function snapshotSummaryRows(snapshot, t) {
  const progress = snapshot?.progress || {};
  const work = progress.work || {};
  const performance = snapshot?.performance || {};
  const quality = snapshot?.quality || {};
  const resources = snapshot?.resources || {};
  const personnel = snapshot?.personnel || {};
  return [
    {
      label: t('workspace.projectHubCompleteProjectGroupProgress'),
      value: t('workspace.projectHubCompleteProjectProgressValue', {
        done: work.doneCount ?? 0,
        total: work.total ?? 0,
        onTime:
          progress.onTime == null
            ? t('workspace.projectHubCompleteProjectOnTimeUnknown')
            : progress.onTime
              ? t('workspace.projectHubCompleteProjectOnTimeYes')
              : t('workspace.projectHubCompleteProjectOnTimeNo'),
      }),
    },
    {
      label: t('workspace.projectHubCompleteProjectGroupPerformance'),
      value: t('workspace.projectHubCompleteProjectPerformanceValue', {
        velocity: performance.velocityHoursAverage ?? 0,
        throughput: performance.throughput?.totalDone ?? 0,
      }),
    },
    {
      label: t('workspace.projectHubCompleteProjectGroupQuality'),
      value: t('workspace.projectHubCompleteProjectQualityValue', {
        bugs: quality.bugCount ?? 0,
        rate: quality.defectRate == null ? '—' : quality.defectRate,
      }),
    },
    {
      label: t('workspace.projectHubCompleteProjectGroupResources'),
      value: t('workspace.projectHubCompleteProjectResourcesValue', {
        planned: resources.plannedHours ?? 0,
        actual: resources.actualHours ?? 0,
      }),
    },
    {
      label: t('workspace.projectHubCompleteProjectGroupPersonnel'),
      value: t('workspace.projectHubCompleteProjectPersonnelValue', {
        n: Array.isArray(personnel.members) ? personnel.members.length : 0,
        unassigned: personnel.unassignedDoneCount ?? 0,
      }),
    },
  ];
}

export default function ProjectHubCompleteProjectModal({
  isOpen,
  projectId,
  projectTitle = '',
  canComplete = false,
  onClose,
  onCompleted,
}) {
  const { t } = useAppStrings();
  const pid = useMemo(() => String(projectId || '').trim(), [projectId]);

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const [closeNotes, setCloseNotes] = useState('');

  const loadPreview = async () => {
    if (!pid) return;
    setLoading(true);
    setError('');
    try {
      const res = await projectAPI.completeProjectPreview(pid);
      const payload = res?.data ?? res;
      setPreview(payload?.data ?? payload);
    } catch (err) {
      setPreview(null);
      setError(
        resolveApiErrorMessage(err, {
          t,
          fallback: t('workspace.projectHubCompleteProjectError'),
        })
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !pid) return undefined;
    setPreview(null);
    setError('');
    setCloseNotes('');
    let mounted = true;
    (async () => {
      if (!mounted) return;
      await loadPreview();
    })();
    return () => {
      mounted = false;
    };
  }, [isOpen, pid]);

  const canSubmit = canComplete && !loading && !submitting && pid && preview?.closeable && !error;

  const submitComplete = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const res = await projectAPI.completeProject(pid, { closeNotes });
      const payload = res?.data ?? res;
      await onCompleted?.(payload?.data ?? payload);
      onClose?.();
    } catch (err) {
      setError(
        resolveApiErrorMessage(err, {
          t,
          fallback: t('workspace.projectHubCompleteProjectError'),
        })
      );
    } finally {
      setSubmitting(false);
    }
  };

  const rows = snapshotSummaryRows(preview?.snapshot, t);

  return (
    <Modal
      isOpen={Boolean(isOpen)}
      onClose={onClose}
      title={t('workspace.projectHubCompleteProjectModalTitle')}
      size="md"
    >
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
            onClick={loadPreview}
            className="rounded-lg border border-border px-3 py-2 text-sm font-semibold text-foreground disabled:opacity-50"
            disabled={submitting}
          >
            {t('workspace.projectHubCompleteProjectRetry')}
          </button>
        </div>
      ) : !preview ? (
        <div className="text-sm text-muted-foreground">{t('common.loading')}</div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs font-semibold text-muted-foreground">{projectTitle}</p>
          <p className="text-sm text-muted-foreground">{t('workspace.projectHubCompleteProjectHint')}</p>
          <ul className="space-y-2 rounded-lg border border-border bg-muted/10 p-3">
            {rows.map((row) => (
              <li key={row.label} className="flex flex-col gap-0.5 text-sm">
                <span className="text-xs font-semibold text-muted-foreground">{row.label}</span>
                <span className="text-foreground">{row.value}</span>
              </li>
            ))}
          </ul>
          <label className="block text-xs font-semibold text-muted-foreground">
            {t('workspace.projectHubCompleteProjectNotes')}
            <textarea
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              rows={3}
              maxLength={4000}
              value={closeNotes}
              onChange={(e) => setCloseNotes(e.target.value)}
              placeholder={t('workspace.projectHubCompleteProjectNotesPh')}
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={submitComplete}
              disabled={!canSubmit}
              className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {t('workspace.projectHubCompleteProjectSubmit')}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
