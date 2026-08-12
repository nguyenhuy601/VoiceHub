import {
  FIGMA_DASH_QUICK_NAV_BTN,
  FIGMA_DASH_QUICK_NAV_GRID,
  FIGMA_DASH_QUICK_NAV_ICON,
} from './figmaDashboardClasses';

export default function DashboardQuickNav({ items, columnCount: _columnCount, onNavigate }) {
  return (
    <div
      className={FIGMA_DASH_QUICK_NAV_GRID}
      style={{
        gridTemplateColumns: `repeat(auto-fit, minmax(${items.length >= 6 ? 126 : 148}px, 1fr))`,
      }}
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.path}
            type="button"
            onClick={() => onNavigate(item.path)}
            className={FIGMA_DASH_QUICK_NAV_BTN}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = `${item.color}40`;
              e.currentTarget.style.boxShadow = `0 4px 16px ${item.color}10`;
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border)';
              e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <div className={FIGMA_DASH_QUICK_NAV_ICON} style={{ background: `${item.color}12` }}>
              <Icon size={17} style={{ color: item.color }} />
            </div>
            <div className="text-center">
              <div className="text-xs font-semibold leading-snug text-foreground">{item.label}</div>
              <div className="mt-0.5 text-[0.625rem] text-muted-foreground">{item.desc}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
