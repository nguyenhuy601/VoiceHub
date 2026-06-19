import { useAppStrings } from '../../locales/appStrings';
import { FIGMA_CHAT_FILTER_ROW, figmaChatFilterChip } from './figmaChatClasses';

export const RAIL_FILTER = {
  ALL: 'all',
  ONLINE: 'online',
  UNREAD: 'unread',
};

const FILTER_KEYS = [RAIL_FILTER.ALL, RAIL_FILTER.ONLINE, RAIL_FILTER.UNREAD];

const FILTER_LABEL_KEYS = {
  [RAIL_FILTER.ALL]: 'friendChat.railFilterAll',
  [RAIL_FILTER.ONLINE]: 'friendChat.railFilterOnline',
  [RAIL_FILTER.UNREAD]: 'friendChat.railFilterUnread',
};

export default function FriendChatFilterChips({ value = RAIL_FILTER.ALL, onChange }) {
  const { t } = useAppStrings();

  return (
    <div className={FIGMA_CHAT_FILTER_ROW} role="tablist" aria-label={t('friendChat.railFilterAria')}>
      {FILTER_KEYS.map((filterKey) => {
        const active = value === filterKey;
        return (
          <button
            key={filterKey}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange?.(filterKey)}
            className={figmaChatFilterChip(active)}
          >
            {t(FILTER_LABEL_KEYS[filterKey])}
          </button>
        );
      })}
    </div>
  );
}
