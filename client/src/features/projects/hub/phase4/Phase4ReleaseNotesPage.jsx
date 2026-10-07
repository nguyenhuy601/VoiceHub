import { Loader2 } from 'lucide-react';
import { useAppStrings } from '../../../../locales/appStrings';
import { AdminLoadErrorState } from '../../../../components/adminUsers/adminPanelStates';
import usePhase4Handover from './usePhase4Handover';
import Phase4SectionCard from './Phase4SectionCard';

/**
 * Phase 4 Release notes — PM HITL tick that release notes were published.
 */
export default function Phase4ReleaseNotesPage({ projectId }) {
  const { t } = useAppStrings();
  const {
    isLoading,
    isLoadError,
    loadFailMessage,
    retryLoad,
    checklist,
    canPhase,
    busy,
    setChecklistItem,
    releaseLabel,
  } = usePhase4Handover(projectId);

  if (isLoading) {
    return (
      <div
        className="flex items-center gap-2 p-4 text-sm text-muted-foreground"
        aria-busy="true"
      >
        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
        <span>{t('common.loading')}</span>
      </div>
    );
  }

  if (isLoadError) {
    return (
      <div className="p-4">
        <AdminLoadErrorState message={loadFailMessage} onRetry={retryLoad} />
      </div>
    );
  }

  const notesOn = Boolean(checklist.release_notes);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 p-3 sm:p-4" aria-busy={busy ? 'true' : undefined}>
      <Phase4SectionCard
        title={t('workspace.phaseNavReleaseNotes')}
        description={t('workspace.phase4ReleaseNotesHint')}
        aside={
          releaseLabel ? (
            <span className="rounded-md border border-border/60 px-2 py-0.5 text-[10px] font-semibold tabular-nums">
              {releaseLabel}
            </span>
          ) : null
        }
      >
        {!canPhase ? (
          <p className="mb-3 text-[11px] font-semibold text-warning">
            {t('workspace.phaseHandoverChecklistPmOnly')}
          </p>
        ) : null}

        <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
          {t('workspace.phase4ReleaseNotesBodyHint')}
        </p>

        <label
          className={`flex items-start gap-2 rounded-xl border px-3 py-3 text-sm focus-within:ring-2 focus-within:ring-ring ${
            notesOn
              ? 'border-success/40 bg-success/10'
              : 'border-border/70 bg-muted/15'
          }`}
        >
          <input
            type="checkbox"
            className="mt-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            checked={notesOn}
            disabled={!canPhase || busy}
            aria-busy={busy ? 'true' : undefined}
            onChange={(e) => void setChecklistItem('release_notes', e.target.checked)}
          />
          <span>
            <span className="font-semibold text-foreground">
              {t('workspace.phaseQaChecklist_release_notes')}
            </span>
            <span className="mt-0.5 block text-[10px] text-muted-foreground">
              {t('workspace.phase4RolePm')}
            </span>
          </span>
        </label>
      </Phase4SectionCard>
    </div>
  );
}
