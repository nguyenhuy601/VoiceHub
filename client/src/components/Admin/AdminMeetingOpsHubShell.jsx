import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import AdminMeetingPicker from '../adminVoice/AdminMeetingPicker';
import { AdminUserPanelShell } from '../adminUsers/adminUserPanelUi';

/**
 * Khung hub cuộc họp: 1 picker + tabs thao tác Voice ops.
 * meetingId qua ?meetingId= (AdminMeetingPicker).
 */
export default function AdminMeetingOpsHubShell({
  title,
  hint,
  orgId,
  tabs,
  defaultTab,
  tabParam = 'tab',
  pickerHint,
  activeOnly = false,
  statusFilter,
  children,
}) {
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = useMemo(() => {
    const raw = String(searchParams.get(tabParam) || '').trim();
    if (raw && tabs.some((tab) => tab.id === raw)) return raw;
    return defaultTab;
  }, [searchParams, tabParam, tabs, defaultTab]);

  const meetingId = String(searchParams.get('meetingId') || '').trim();

  const setTab = (nextId) => {
    const params = new URLSearchParams(searchParams);
    if (nextId === defaultTab) params.delete(tabParam);
    else params.set(tabParam, nextId);
    setSearchParams(params, { replace: true });
  };

  return (
    <AdminUserPanelShell title={title} hint={hint} wide>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-start">
        <AdminMeetingPicker
          orgId={orgId}
          selectedMeetingId={meetingId}
          hint={pickerHint}
          activeOnly={activeOnly}
          statusFilter={statusFilter}
        />
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label={title}>
            {tabs.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(tab.id)}
                  className={[
                    'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                    active
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground',
                  ].join(' ')}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
          <div role="tabpanel">{children({ activeTab, meetingId })}</div>
        </div>
      </div>
    </AdminUserPanelShell>
  );
}

