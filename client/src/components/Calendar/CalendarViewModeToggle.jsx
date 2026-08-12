import { Grid3X3, LayoutGrid, List } from 'lucide-react';
import { useAppStrings } from '../../locales/appStrings';
import {
  FIGMA_CAL_VIEW_TOGGLE_ACTIVE,
  FIGMA_CAL_VIEW_TOGGLE_IDLE,
  FIGMA_CAL_VIEW_TOGGLE_WRAP,
} from './figmaCalendarClasses';

const MODES = [
  { id: 'month', icon: Grid3X3, labelKey: 'calendar.viewModeMonth' },
  { id: 'week', icon: LayoutGrid, labelKey: 'calendar.viewModeWeek' },
  { id: 'list', icon: List, labelKey: 'calendar.viewModeList' },
];

export default function CalendarViewModeToggle({ value, onChange }) {
  const { t } = useAppStrings();
  return (
    <div className={FIGMA_CAL_VIEW_TOGGLE_WRAP} role="group" aria-label={t('calendar.viewModeGroupAria')}>
      {MODES.map(({ id, icon: Icon, labelKey }) => {
        const active = value === id;
        const label = t(labelKey);
        return (
          <button
            key={id}
            type="button"
            title={label}
            aria-label={label}
            aria-pressed={active}
            onClick={() => onChange(id)}
            className={active ? FIGMA_CAL_VIEW_TOGGLE_ACTIVE : FIGMA_CAL_VIEW_TOGGLE_IDLE}
          >
            <Icon size={15} />
          </button>
        );
      })}
    </div>
  );
}
