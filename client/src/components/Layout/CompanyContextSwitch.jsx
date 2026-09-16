import { Building2, Users } from 'lucide-react';
import { useAppStrings } from '../../locales/appStrings';
import { COMPANY_SPACE_LEVEL } from '../../utils/companySpaceLevel';
import { SUITE_COLORS } from './figmaShellClasses';

/**
 * L2 switch: left = department, right = team (opens picker on right click).
 */
export default function CompanyContextSwitch({
  level = COMPANY_SPACE_LEVEL.DEPARTMENT,
  departmentLabel = '',
  teamLabel = '',
  collapsed = false,
  onSelectDepartment,
  onOpenTeamPicker,
}) {
  const { t } = useAppStrings();
  const suiteColor = SUITE_COLORS.company || '#10B981';
  const isTeam = level === COMPANY_SPACE_LEVEL.TEAM;

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => (isTeam ? onSelectDepartment?.() : onOpenTeamPicker?.())}
        className="mx-auto mb-1 flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/10"
        title={isTeam ? teamLabel || t('nav.companyLevelTeam') : departmentLabel || t('nav.companyLevelDepartment')}
        aria-label={t('nav.companyLevelSwitch')}
      >
        {isTeam ? <Users size={14} /> : <Building2 size={14} />}
      </button>
    );
  }

  return (
    <div className="mx-2 mb-2 mt-1">
      <div
        className="relative grid grid-cols-2 rounded-lg border p-0.5"
        style={{ borderColor: `${suiteColor}33`, background: 'rgba(255,255,255,0.04)' }}
        role="group"
        aria-label={t('nav.companyLevelSwitch')}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-0.5 top-0.5 w-[calc(50%-2px)] rounded-md transition-transform duration-200 ease-out"
          style={{
            background: `${suiteColor}28`,
            border: `1px solid ${suiteColor}55`,
            transform: isTeam ? 'translateX(calc(100% + 2px))' : 'translateX(0)',
            left: 2,
          }}
        />
        <button
          type="button"
          onClick={() => onSelectDepartment?.()}
          className="relative z-[1] flex items-center justify-center gap-1 rounded-md px-1.5 py-1.5 text-[0.625rem] font-semibold uppercase tracking-wide transition"
          style={{ color: !isTeam ? suiteColor : 'rgba(255,255,255,0.35)' }}
          aria-pressed={!isTeam}
        >
          <Building2 size={11} className="shrink-0" />
          <span className="truncate">{t('nav.companyLevelDepartment')}</span>
        </button>
        <button
          type="button"
          onClick={() => onOpenTeamPicker?.()}
          className="relative z-[1] flex items-center justify-center gap-1 rounded-md px-1.5 py-1.5 text-[0.625rem] font-semibold uppercase tracking-wide transition"
          style={{ color: isTeam ? suiteColor : 'rgba(255,255,255,0.35)' }}
          aria-pressed={isTeam}
        >
          <Users size={11} className="shrink-0" />
          <span className="truncate">{t('nav.companyLevelTeam')}</span>
        </button>
      </div>
      <div className="mt-1 truncate px-0.5 text-[0.625rem] text-white/35">
        {isTeam
          ? teamLabel || t('nav.companyTeamPickerTitle')
          : departmentLabel || t('nav.companyHome')}
      </div>
    </div>
  );
}
