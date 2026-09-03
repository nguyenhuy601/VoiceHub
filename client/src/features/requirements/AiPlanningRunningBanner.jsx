import { Loader2 } from 'lucide-react';

/**
 * Inline loading banner while AI Planning pipeline runs (heuristic + LLM).
 */
export default function AiPlanningRunningBanner({ t, className = '' }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm text-foreground ${className}`.trim()}
      role="status"
      aria-live="polite"
    >
      <Loader2
        className="h-4 w-4 shrink-0 animate-spin text-cyan-600 dark:text-cyan-400"
        aria-hidden
      />
      <span>{t('requirements.aiPlanningStatus.pending')}</span>
    </div>
  );
}
