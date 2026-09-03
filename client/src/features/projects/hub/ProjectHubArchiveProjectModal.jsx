import { useMemo, useState } from 'react';
import Modal from '../../../components/Shared/Modal';
import { useAppStrings } from '../../../locales/appStrings';
import projectAPI from '../../../services/api/projectAPI';
import { resolveApiErrorMessage } from '../../../utils/resolveApiErrorMessage';

export default function ProjectHubArchiveProjectModal({
  isOpen,
  projectId,
  projectTitle = '',
  earlyArchive = false,
  onClose,
  onArchived,
}) {
  const { t } = useAppStrings();
  const pid = useMemo(() => String(projectId || '').trim(), [projectId]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleArchive = async () => {
    if (!pid || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await projectAPI.archive(pid);
      onArchived?.();
    } catch (err) {
      setError(
        resolveApiErrorMessage(err, {
          t,
          fallback: t('workspace.projectHubArchiveFail'),
        })
      );
    } finally {
      setSubmitting(false);
    }
  };

  const confirmText = earlyArchive
    ? t('workspace.projectHubArchiveEarlyConfirm', { title: projectTitle || '—' })
    : t('workspace.projectHubArchiveProjectConfirm', { title: projectTitle || '—' });

  return (
    <Modal
      isOpen={Boolean(isOpen)}
      onClose={onClose}
      title={t('workspace.projectHubArchiveProjectModalTitle')}
      size="md"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleArchive}
            disabled={submitting || !pid}
            className="rounded-lg bg-destructive px-3 py-2 text-sm font-semibold text-destructive-foreground disabled:opacity-50"
          >
            {submitting ? t('workspace.projectHubArchiveProjectSubmitting') : t('workspace.projectHubArchiveProjectSubmit')}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-foreground">{confirmText}</p>
        {earlyArchive ? (
          <p className="text-xs text-muted-foreground">{t('workspace.projectHubArchiveEarlyHint')}</p>
        ) : (
          <p className="text-xs text-muted-foreground">{t('workspace.projectHubArchiveProjectHint')}</p>
        )}
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
