import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppStrings } from '../../locales/appStrings';
import useAdminMeetings from '../../hooks/useAdminMeetings';
import { adminPrimaryBtnClass } from '../adminUsers/adminUserPanelUi';
import {
  formatMeetingWhen,
  isActiveMeeting,
  meetingId,
  meetingStatus,
  meetingTitle,
} from '../../utils/adminVoiceUtils';

export default function AdminMeetingPicker({
  orgId,
  selectedMeetingId,
  hint,
  statusFilter,
  activeOnly = false,
}) {
  const { t, locale } = useAppStrings();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const { meetings, loading, error, loadMeetings } = useAdminMeetings(orgId, { status: statusFilter });

  const activeId = String(selectedMeetingId || searchParams.get('meetingId') || '').trim();

  const filtered = useMemo(() => {
    let list = meetings;
    if (activeOnly) list = list.filter(isActiveMeeting);
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((m) => {
      const id = meetingId(m).toLowerCase();
      return meetingTitle(m).toLowerCase().includes(q) || id.includes(q) || meetingStatus(m).includes(q);
    });
  }, [meetings, query, activeOnly]);

  const pick = (id) => {
    const next = new URLSearchParams(searchParams);
    next.set('meetingId', id);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card/40 p-4">
      <div>
        <h3 className="text-sm font-semibold">{t('adminVoice.pickerTitle')}</h3>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('adminVoice.searchMeeting')}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
      />
      {loading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : error ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3">
          <p className="text-sm text-destructive">{error}</p>
          <div className="mt-3">
            <button type="button" className={adminPrimaryBtnClass()} onClick={() => loadMeetings()}>
              {t('adminRbac.retry')}
            </button>
          </div>
        </div>
      ) : (
        <div className="max-h-72 overflow-auto rounded-lg border border-border/70">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-muted/80 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">{t('adminVoice.colTitle')}</th>
                <th className="px-3 py-2">{t('adminVoice.colStatus')}</th>
                <th className="px-3 py-2">{t('adminVoice.colWhen')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => {
                const id = meetingId(m);
                const active = id === activeId;
                return (
                  <tr
                    key={id}
                    className={`cursor-pointer border-t border-border/60 ${active ? 'bg-red-500/10' : 'hover:bg-muted/30'}`}
                    onClick={() => pick(id)}
                  >
                    <td className="px-3 py-2 font-medium">{meetingTitle(m)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{meetingStatus(m)}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {formatMeetingWhen(m.startTime || m.createdAt || m.endedAt, locale)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!filtered.length ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">{t('adminVoice.noMeetings')}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
