import { useAppStrings } from '../../locales/appStrings';

/**
 * Phase A: project document library chưa có projectId trên document-service.
 * Empty/partial state — hub Files vẫn là attachment work items.
 */
export default function ProjectFilesFallback({ projectId = '', organizationId = '' }) {
  const { t } = useAppStrings();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-sm font-semibold text-foreground">{t('nav.documents')}</p>
      <p className="max-w-md text-sm text-muted-foreground">
          {t('nav.projectDocumentsPhaseAHint')}
      </p>
      <p className="text-xs text-muted-foreground">
        projectId={String(projectId || '—')} · org={String(organizationId || '—')}
      </p>
    </div>
  );
}
