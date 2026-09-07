import { ArrowUpRight, Building2, TrendingDown, TrendingUp } from 'lucide-react';
import {
  FIGMA_DASH_METRIC_CARD,
  FIGMA_DASH_METRIC_GRID,
  FIGMA_DASH_METRIC_ICON,
  FIGMA_DASH_METRIC_ICON_BOX,
  FIGMA_DASH_METRIC_LABEL,
  FIGMA_DASH_METRIC_VALUE,
} from './figmaDashboardClasses';

function metricGridExtra(count) {
  if (count === 3) return 'grid-cols-1 sm:grid-cols-3 lg:grid-cols-3';
  if (count === 4) return 'grid-cols-2 lg:grid-cols-4';
  return '';
}

export default function DashboardMetricCards({ cards, onCardClick }) {
  const clickable = Boolean(onCardClick);

  return (
    <div className={`${FIGMA_DASH_METRIC_GRID} ${metricGridExtra(cards.length)}`}>
      {cards.map((card2) => {
        const Icon = card2.icon && typeof card2.icon !== 'string' ? card2.icon : Building2;
        const Wrapper = clickable ? 'button' : 'div';
        const trendText = card2.change ?? card2.trend;
        const detailText = card2.detail ?? card2.sub;
        const trendDirection =
          card2.trend === 'down' || card2.trendUp === false
            ? 'down'
            : card2.trend === 'up' || card2.trendUp
              ? 'up'
              : null;
        const TrendIcon = trendDirection === 'down' ? TrendingDown : TrendingUp;

        return (
          <Wrapper
            key={card2.key}
            type={clickable ? 'button' : undefined}
            onClick={clickable ? () => onCardClick(card2.key) : undefined}
            className={`${FIGMA_DASH_METRIC_CARD} group w-full text-left ${
              clickable
                ? 'cursor-pointer hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35'
                : 'cursor-default'
            }`}
          >
            <div className={FIGMA_DASH_METRIC_ICON}>
              <div
                className={`${FIGMA_DASH_METRIC_ICON_BOX} transition-transform duration-150 group-hover:scale-[1.03]`}
                style={{ background: card2.bg, borderColor: `${card2.color}20` }}
              >
                <span className="inline-flex" style={{ color: card2.color || 'currentColor' }}>
                  <Icon size={18} strokeWidth={2.2} />
                </span>
              </div>
              {clickable ? (
                <ArrowUpRight
                  size={14}
                  className="mt-0.5 text-muted-foreground/40 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                />
              ) : null}
            </div>
            <div className={FIGMA_DASH_METRIC_VALUE}>{card2.value}</div>
            <div className={FIGMA_DASH_METRIC_LABEL}>{card2.label}</div>
            {(trendText || detailText) && (
              <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
                {trendText ? (
                  <span
                    className={`inline-flex items-center gap-0.5 text-xs font-bold ${
                      trendDirection === 'down' ? 'text-destructive' : 'text-success'
                    }`}
                  >
                    {trendDirection ? <TrendIcon size={12} strokeWidth={2.4} /> : null}
                    {trendText}
                  </span>
                ) : null}
                {detailText ? (
                  <span className="min-w-0 text-[0.6875rem] leading-snug text-muted-foreground">
                    {detailText}
                  </span>
                ) : null}
              </div>
            )}
          </Wrapper>
        );
      })}
    </div>
  );
}
