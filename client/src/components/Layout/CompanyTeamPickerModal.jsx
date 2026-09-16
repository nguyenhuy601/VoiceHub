import { useEffect } from 'react';
import { Users, X } from 'lucide-react';
import { useAppStrings } from '../../locales/appStrings';
import { SUITE_COLORS } from './figmaShellClasses';

/**
 * Popup list of teams the current user belongs to.
 */
export default function CompanyTeamPickerModal({
  isOpen,
  onClose,
  teams = [],
  selectedTeamId = '',
  onSelect,
}) {
  const { t } = useAppStrings();
  const suiteColor = SUITE_COLORS.company || '#10B981';

  useEffect(() => {
    if (!isOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/55"
        aria-label={t('common.close')}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="company-team-picker-title"
        className="relative z-[1] flex max-h-[min(70vh,420px)] w-full max-w-sm flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2
              id="company-team-picker-title"
              className="m-0 text-sm font-semibold text-foreground"
            >
              {t('nav.companyTeamPickerTitle')}
            </h2>
            <p className="m-0 mt-0.5 text-xs text-muted-foreground">
              {t('nav.companyTeamPickerSub')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label={t('common.close')}
          >
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {!teams.length ? (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              {t('nav.companyTeamPickerEmpty')}
            </div>
          ) : (
            <ul className="m-0 list-none space-y-1 p-0">
              {teams.map((team) => {
                const active = String(team.id) === String(selectedTeamId || '');
                return (
                  <li key={team.id}>
                    <button
                      type="button"
                      onClick={() => onSelect?.(team)}
                      className="flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition"
                      style={{
                        borderColor: active ? `${suiteColor}66` : 'transparent',
                        background: active ? `${suiteColor}14` : 'transparent',
                      }}
                    >
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                        style={{ background: `${suiteColor}18`, color: suiteColor }}
                      >
                        <Users size={14} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {team.name}
                        </span>
                      </span>
                      {active ? (
                        <span className="text-[0.625rem] font-bold uppercase" style={{ color: suiteColor }}>
                          {t('nav.companyTeamSelected')}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
