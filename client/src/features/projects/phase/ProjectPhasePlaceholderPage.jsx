import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { useAppStrings } from '../../../locales/appStrings';
import { PHASE_MODULE_LABEL_KEYS } from '../../../utils/projectPhaseNav';
import { normalizeProjectModule } from '../../../utils/suiteNavConfig';

/**
 * Placeholder shell for Phase 1 analysis modules (import-first UI later).
 */
export default function ProjectPhasePlaceholderPage() {
  const { module: moduleParam } = useParams();
  const module = normalizeProjectModule(moduleParam);
  const { t } = useAppStrings();
  const titleKey = PHASE_MODULE_LABEL_KEYS[module];
  const title = titleKey ? t(titleKey) : module;

  const hint = useMemo(() => t('workspace.phaseModulePlaceholderHint'), [t]);

  return (
    <div className="scrollbar-overlay flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-4 sm:px-4">
      <div className="mx-auto w-full max-w-3xl rounded-xl border border-border bg-surface p-6">
        <div className="flex items-start gap-3">
          <span className="rounded-lg bg-muted p-2 text-foreground">
            <FileText size={20} aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-foreground">{title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{hint}</p>
            <p className="mt-3 font-mono text-xs text-muted-foreground">{module}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
