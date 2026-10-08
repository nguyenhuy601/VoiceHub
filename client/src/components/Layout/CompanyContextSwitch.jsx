import { Building2, ChevronLeft, Users } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useAppStrings } from '../../locales/appStrings';
import { COMPANY_SPACE_LEVEL } from '../../utils/companySpaceLevel';
import { isCompanyDocumentsModulePath } from '../../utils/suitePathUtils';
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
  const location = useLocation();
  const isDrive = isCompanyDocumentsModulePath(location.pathname);
  const suiteColor = SUITE_COLORS.company || '#10B981';
  const isTeam = level === COMPANY_SPACE_LEVEL.TEAM;
  const deptSwitchLabel = isDrive ? t('nav.driveLevelDepartment') : t('nav.companyLevelDepartment');
  const teamSwitchLabel = isDrive ? t('nav.driveLevelTeam') : t('nav.companyLevelTeam');
  const switchAria = isDrive ? t('nav.driveLevelSwitch') : t('nav.companyLevelSwitch');

  if (collapsed) {
    return (
      <div className="mx-auto mb-1 flex flex-col items-center gap-1">
        {isTeam ? (
          <button
            type="button"
            onClick={() => onSelectDepartment?.()}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/10"
            title={t('workspace.backToDepartments')}
            aria-label={t('workspace.backToDepartments')}
          >
            <ChevronLeft size={14} />
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => onOpenTeamPicker?.()}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/10"
          title={isTeam ? teamLabel || teamSwitchLabel : departmentLabel || deptSwitchLabel}
          aria-label={switchAria}
        >
          {isTeam ? <Users size={14} /> : <Building2 size={14} />}
        </button>
      </div>
    );
  }

  return (
    <div className="mx-2 mb-2 mt-1">
      {isDrive ? (
        <p className="mb-1 px-0.5 text-[0.5625rem] font-semibold uppercase tracking-wide text-white/30">
          {t('nav.driveLevelSwitch')}
        </p>
      ) : null}
      <div
        className="relative grid grid-cols-2 rounded-lg border p-0.5"
        style={{ borderColor: `${suiteColor}33`, background: 'rgba(255,255,255,0.04)' }}
        role="group"
        aria-label={switchAria}
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
          <span className="truncate">{deptSwitchLabel}</span>
        </button>
        <button
          type="button"
          onClick={() => onOpenTeamPicker?.()}
          className="relative z-[1] flex items-center justify-center gap-1 rounded-md px-1.5 py-1.5 text-[0.625rem] font-semibold uppercase tracking-wide transition"
          style={{ color: isTeam ? suiteColor : 'rgba(255,255,255,0.35)' }}
          aria-pressed={isTeam}
        >
          <Users size={11} className="shrink-0" />
          <span className="truncate">{teamSwitchLabel}</span>
        </button>
      </div>
      <div className="mt-1 flex min-w-0 items-center gap-0.5 px-0.5 text-[0.625rem] text-white/35">
        {isTeam ? (
          <button
            type="button"
            onClick={() => onSelectDepartment?.()}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-white/55 transition hover:bg-white/10 hover:text-white"
            title={t('workspace.backToDepartments')}
            aria-label={t('workspace.backToDepartments')}
          >
            <ChevronLeft size={12} />
          </button>
        ) : null}
        <span className="truncate">
          {isTeam
            ? teamLabel || t('nav.companyTeamPickerTitle')
            : departmentLabel || t('nav.companyHome')}
        </span>
      </div>
    </div>
  );
}
