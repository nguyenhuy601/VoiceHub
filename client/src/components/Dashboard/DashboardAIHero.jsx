import { useEffect, useState } from 'react';
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
} from './figmaDashboardClasses';

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
  const [displayText, setDisplayText] = useState('');
  const [insightIdx, setInsightIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const safeInsights =
    Array.isArray(insights) && insights.length ? insights : [t('dashboard.aiSummarizing')];

  useEffect(() => {
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
  }, [charIdx, isDeleting, insightIdx, safeInsights]);

  return (
    <div className={FIGMA_DASH_AI_HERO}>
      <div className="pointer-events-none absolute -right-10 -top-[60px] h-[240px] w-[240px] rounded-full bg-[radial-gradient(circle,rgba(249,115,22,0.1)_0%,transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-[-40px] left-[35%] h-[180px] w-[180px] rounded-full bg-[radial-gradient(circle,rgba(37,99,235,0.06)_0%,transparent_70%)]" />
      <div className={FIGMA_DASH_AI_HERO_GRID}>
        <div>
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
              <Sparkles size={14} className="text-white" />
            </div>
            <div>
              <div className="mb-0.5 flex flex-wrap items-center gap-2">
                <div className={FIGMA_DASH_AI_INSIGHT_LABEL}>{t('dashboard.aiInsightLabel')}</div>
              </div>
              <p className={FIGMA_DASH_AI_INSIGHT_TEXT}>
                {displayText}
                <span className="ml-px inline-block h-[13px] w-0.5 animate-pulse bg-ai align-middle" />
              </p>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-2.5">
          {heroStats.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className={FIGMA_DASH_AI_STAT}>
                <div className={FIGMA_DASH_AI_STAT_ICON} style={{ background: `${s.color}15` }}>
                  <Icon size={13} style={{ color: s.color }} />
                </div>
                <div>
                  <div className="text-[0.5875rem] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                    {s.label}
                  </div>
                  <div
                    className="text-[1.0625rem] font-bold leading-tight tracking-[-0.02em]"
                    style={{ color: s.color }}
                  >
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
