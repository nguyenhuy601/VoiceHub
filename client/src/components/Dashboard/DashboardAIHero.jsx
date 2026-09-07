import { useEffect, useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useAppStrings } from '../../locales/appStrings';
import {
  FIGMA_DASH_AI_HERO,
  FIGMA_DASH_AI_HERO_GRADIENT,
  FIGMA_DASH_AI_HERO_GRID,
  FIGMA_DASH_AI_HERO_SUB,
  FIGMA_DASH_AI_HERO_TITLE,
  FIGMA_DASH_AI_INSIGHT_BOX,
  FIGMA_DASH_AI_INSIGHT_ICON,
  FIGMA_DASH_AI_INSIGHT_LABEL,
  FIGMA_DASH_AI_INSIGHT_TEXT,
  FIGMA_DASH_AI_STAT,
  FIGMA_DASH_AI_STAT_ICON,
  FIGMA_DASH_AI_STAT_STACK,
} from './figmaDashboardClasses';
import { useDashCompactLayout, usePrefersReducedMotion } from './useDashCompactLayout';

const INSIGHT_CLAMP_CHARS = 88;

const STAT_TONE = {
  success: { wrap: 'bg-success/15', icon: 'text-success', value: 'text-success' },
  danger: { wrap: 'bg-destructive/15', icon: 'text-destructive', value: 'text-destructive' },
  primary: { wrap: 'bg-primary/15', icon: 'text-primary', value: 'text-primary' },
};

export default function DashboardAIHero({
  greeting,
  userName,
  insights,
  priorityDm,
  priorityMeetings,
  pendingApprovals = 0,
  heroStats,
}) {
  const { t } = useAppStrings();
  const compact = useDashCompactLayout();
  const reduceMotion = usePrefersReducedMotion();
  const staticInsight = compact || reduceMotion;
  const fallbackInsight = t('dashboard.aiSummarizing');
  const safeInsights = useMemo(
    () => (Array.isArray(insights) && insights.length ? insights : [fallbackInsight]),
    [insights, fallbackInsight]
  );
  const [displayText, setDisplayText] = useState('');
  const [insightIdx, setInsightIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [insightExpanded, setInsightExpanded] = useState(false);

  useEffect(() => {
    if (staticInsight) return undefined;
    const fullText = safeInsights[insightIdx % safeInsights.length];
    let timer;
    if (!isDeleting && charIdx < fullText.length) {
      timer = setTimeout(() => {
        setDisplayText(fullText.slice(0, charIdx + 1));
        setCharIdx((c) => c + 1);
      }, 26);
    } else if (!isDeleting && charIdx === fullText.length) {
      timer = setTimeout(() => setIsDeleting(true), 3200);
    } else if (isDeleting && charIdx > 0) {
      timer = setTimeout(() => {
        setDisplayText(fullText.slice(0, charIdx - 1));
        setCharIdx((c) => c - 1);
      }, 11);
    } else if (isDeleting && charIdx === 0) {
      setIsDeleting(false);
      setInsightIdx((i) => (i + 1) % safeInsights.length);
    }
    return () => clearTimeout(timer);
  }, [charIdx, isDeleting, insightIdx, safeInsights, staticInsight]);

  const insightFull = staticInsight ? String(safeInsights[0] || '') : displayText;
  const canToggleInsight = staticInsight && insightFull.length > INSIGHT_CLAMP_CHARS;
  const insightClamped = canToggleInsight && !insightExpanded;

  return (
    <div className={FIGMA_DASH_AI_HERO}>
      <div className="pointer-events-none absolute -right-10 -top-[60px] h-[240px] w-[240px] rounded-full bg-ai/10 blur-2xl" />
      <div className="pointer-events-none absolute bottom-[-40px] left-[35%] h-[180px] w-[180px] rounded-full bg-primary/10 blur-2xl" />
      <div className={FIGMA_DASH_AI_HERO_GRID}>
        <div className="min-w-0">
          <h2 className={FIGMA_DASH_AI_HERO_TITLE}>
            {greeting},{' '}
            <span className={FIGMA_DASH_AI_HERO_GRADIENT}>{userName}</span>!
          </h2>
          <p className={FIGMA_DASH_AI_HERO_SUB}>
            {t('dashboard.aiHeroSummary', { dm: priorityDm, meetings: priorityMeetings })}
            {pendingApprovals > 0
              ? ` ${t('dashboard.aiHeroPendingApprovals', { n: pendingApprovals })}`
              : ` ${t('dashboard.aiHeroNoUrgentApprovals')}`}
          </p>
          <div className={FIGMA_DASH_AI_INSIGHT_BOX}>
            <div className={FIGMA_DASH_AI_INSIGHT_ICON}>
              <Sparkles size={14} className="text-ai-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-0.5 flex flex-wrap items-center gap-2">
                <div className={FIGMA_DASH_AI_INSIGHT_LABEL}>{t('dashboard.aiInsightLabel')}</div>
              </div>
              <p className={`${FIGMA_DASH_AI_INSIGHT_TEXT}${insightClamped ? ' line-clamp-2' : ''}`}>
                {insightFull}
                {!staticInsight ? (
                  <span className="ml-px inline-block h-[13px] w-0.5 animate-pulse bg-ai align-middle" />
                ) : null}
              </p>
              {canToggleInsight ? (
                <button
                  type="button"
                  className="mt-1 text-[0.75rem] font-medium text-primary hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                  onClick={() => setInsightExpanded((open) => !open)}
                >
                  {insightExpanded ? t('dashboard.insightSeeLess') : t('dashboard.insightSeeMore')}
                </button>
              ) : null}
            </div>
          </div>
        </div>
        <div className={FIGMA_DASH_AI_STAT_STACK}>
          {(heroStats || []).map((s) => {
            const Icon = s.icon;
            const tone = STAT_TONE[s.tone] || STAT_TONE.primary;
            const caption = compact && s.shortLabel ? s.shortLabel : s.label;
            return (
              <div key={s.label} className={FIGMA_DASH_AI_STAT}>
                <div className={`${FIGMA_DASH_AI_STAT_ICON} ${tone.wrap}`}>
                  <Icon size={13} className={tone.icon} />
                </div>
                <div className="min-w-0 w-full lg:w-auto">
                  <div
                    className="max-w-full truncate text-[0.625rem] font-semibold tracking-tight text-muted-foreground lg:text-[0.5875rem] lg:uppercase lg:tracking-[0.05em]"
                    title={s.label}
                  >
                    {caption}
                  </div>
                  <div className={`text-base font-bold leading-tight tracking-[-0.02em] lg:text-[1.0625rem] ${tone.value}`}>
                    {s.value}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
