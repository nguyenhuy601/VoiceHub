import { useMemo, useState } from 'react';
import Modal from '../../../components/Shared/Modal';
import { useAppStrings } from '../../../locales/appStrings';
import projectAPI from '../../../services/api/projectAPI';
import { resolveApiErrorMessage } from '../../../utils/resolveApiErrorMessage';

export default function ProjectHubArchiveProjectModal({
  isOpen,
  projectId,
  projectTitle = '',
  draftDelete = false,
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
          fallback: draftDelete
            ? t('workspace.projectHubDeleteDraftFail')
            : t('workspace.projectHubArchiveFail'),
        })
      );
    } finally {
      setSubmitting(false);
    }
  };

  const confirmText = draftDelete
    ? t('workspace.projectHubDeleteDraftConfirm', { title: projectTitle || '—' })
    : earlyArchive
      ? t('workspace.projectHubArchiveEarlyConfirm', { title: projectTitle || '—' })
      : t('workspace.projectHubArchiveProjectConfirm', { title: projectTitle || '—' });

  const hintText = draftDelete
    ? t('workspace.projectHubDeleteDraftHint')
    : earlyArchive
      ? t('workspace.projectHubArchiveEarlyHint')
      : t('workspace.projectHubArchiveProjectHint');

  const modalTitle = draftDelete
    ? t('workspace.projectHubDeleteDraftModalTitle')
    : t('workspace.projectHubArchiveProjectModalTitle');

  const submitLabel = submitting
    ? draftDelete
      ? t('workspace.projectHubDeleteDraftSubmitting')
      : t('workspace.projectHubArchiveProjectSubmitting')
    : draftDelete
      ? t('workspace.projectHubDeleteDraftSubmit')
      : t('workspace.projectHubArchiveProjectSubmit');

  return (
    <Modal
      isOpen={Boolean(isOpen)}
      onClose={onClose}
      title={modalTitle}
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
            {submitLabel}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-foreground">{confirmText}</p>
        <p className="text-xs text-muted-foreground">{hintText}</p>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
