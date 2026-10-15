import { useEffect, useId, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAdminTabLoading } from '../../hooks/useAdminShellLoading';
import { useAppStrings } from '../../locales/appStrings';
import { AdminUserPanelShell } from '../../components/adminUsers/adminUserPanelUi';
import UserExcelImportPanel from './UserExcelImportPanel';
import UserCreatePanel from './UserCreatePanel';

const MODE_EXCEL = 'excel';
const MODE_INVITE = 'invite';

/**
 * Một cửa “Thêm nhân sự”:
 * - excel (mặc định): nạp HR master (profile + phòng + capacity)
 * - invite: mời 1 người
 * CSV advanced đã deprecate — ?mode=csv coerce về Excel (SoT import nhiều người).
 */
export default function UserImportHubPanel({ orgId }) {
  const { t } = useAppStrings();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabRefs = useRef({});
  const baseId = useId();

  const mode = useMemo(() => {
    const raw = String(searchParams.get('mode') || searchParams.get('tab') || '')
      .toLowerCase()
      .trim();
    if (raw === MODE_INVITE || raw === 'create') return MODE_INVITE;
    return MODE_EXCEL;
  }, [searchParams]);

  // Deep-link cũ ?mode=csv|tab=csv → normalize URL về Excel.
  useEffect(() => {
    const raw = String(searchParams.get('mode') || searchParams.get('tab') || '')
      .toLowerCase()
      .trim();
    if (raw !== 'csv') return;
    const params = new URLSearchParams(searchParams);
    params.delete('mode');
    params.delete('tab');
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);

  const { markTabSwitch } = useAdminTabLoading(mode);

  const setMode = (next) => {
    markTabSwitch(next);
    const params = new URLSearchParams(searchParams);
    params.delete('tab');
    if (next === MODE_EXCEL) params.delete('mode');
    else params.set('mode', next);
    setSearchParams(params, { replace: true });
  };

  const tabs = [
    { id: MODE_EXCEL, label: t('adminDomains.users.modeExcel') },
    { id: MODE_INVITE, label: t('adminDomains.users.modeInvite') },
  ];

  const focusTab = (index) => {
    const next = tabs[(index + tabs.length) % tabs.length];
    setMode(next.id);
    tabRefs.current[next.id]?.focus();
  };

  const handleTabKeyDown = (event, index) => {
    if (event.key === 'ArrowRight') focusTab(index + 1);
    else if (event.key === 'ArrowLeft') focusTab(index - 1);
    else if (event.key === 'Home') focusTab(0);
    else if (event.key === 'End') focusTab(tabs.length - 1);
    else return;
    event.preventDefault();
  };

  return (
    <AdminUserPanelShell title={t('adminDomains.users.import')}>
      <div
        role="tablist"
        aria-label={t('adminDomains.users.import')}
        className="mb-4 flex flex-wrap items-center gap-2"
      >
        {tabs.map((tab, index) => {
          const selected = mode === tab.id;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[tab.id] = el;
              }}
              id={`${baseId}-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${baseId}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setMode(tab.id)}
              onKeyDown={(e) => handleTabKeyDown(e, index)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none ${
                selected
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted text-muted-foreground hover:bg-primary-subtle hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div id={`${baseId}-panel`} role="tabpanel" aria-labelledby={`${baseId}-tab-${mode}`}>
        {mode === MODE_INVITE ? <UserCreatePanel orgId={orgId} embedded /> : null}
        {mode === MODE_EXCEL ? <UserExcelImportPanel orgId={orgId} embedded /> : null}
      </div>
    </AdminUserPanelShell>
  );
}
