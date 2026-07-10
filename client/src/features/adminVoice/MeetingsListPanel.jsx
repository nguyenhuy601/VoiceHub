import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { useAppStrings } from '../../locales/appStrings';
import useAdminMeetings from '../../hooks/useAdminMeetings';
import {
  formatMeetingWhen,
  meetingId,
  meetingStatus,
  meetingTitle,
} from '../../utils/adminVoiceUtils';

const LINKS = [
  { path: '/app/admin/voice/end-meeting', labelKey: 'adminDomains.voice.endMeeting' },
  { path: '/app/admin/voice/recording', labelKey: 'adminDomains.voice.recording' },
  { path: '/app/admin/voice/transcript', labelKey: 'adminDomains.voice.transcript' },
  { path: '/app/admin/voice/ai-summary', labelKey: 'adminDomains.voice.aiSummary' },
];

export default function MeetingsListPanel({ orgId }) {
  const { t, locale } = useAppStrings();
  const { meetings, loading } = useAdminMeetings(orgId);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');

  const filtered = useMemo(() => {
    let list = meetings;
    if (status) list = list.filter((m) => meetingStatus(m) === status);
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((m) => meetingTitle(m).toLowerCase().includes(q) || meetingId(m).includes(q));
  }, [meetings, query, status]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{t('adminDomains.voice.meetings')}</h2>
        <p className="text-sm text-muted-foreground">{t('adminVoice.meetingsHint')}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('adminVoice.searchMeeting')}
          className="min-w-[200px] flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
        <select
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">{t('adminVoice.filterAllStatus')}</option>
          <option value="scheduled">scheduled</option>
          <option value="active">active</option>
          <option value="ended">ended</option>
        </select>
      </div>
      <div className="overflow-auto rounded-xl border border-border">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">{t('adminVoice.colTitle')}</th>
              <th className="px-3 py-2">{t('adminVoice.colStatus')}</th>
              <th className="px-3 py-2">{t('adminVoice.colWhen')}</th>
              <th className="px-3 py-2">{t('adminVoice.colActions')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((m) => {
              const id = meetingId(m);
              return (
                <tr key={id} className="border-t border-border/60">
                  <td className="px-3 py-2 font-medium">{meetingTitle(m)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{meetingStatus(m)}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {formatMeetingWhen(m.startTime || m.createdAt, locale)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {LINKS.map((link) => (
                        <Link
                          key={link.path}
                          to={`${link.path}?meetingId=${encodeURIComponent(id)}`}
                          className="rounded border border-border px-2 py-0.5 text-xs hover:bg-muted/40"
                        >
                          {t(link.labelKey)}
                        </Link>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {loading ? <p className="px-3 py-4 text-sm text-muted-foreground">{t('common.loading')}</p> : null}
        {!loading && !filtered.length ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">{t('adminVoice.noMeetings')}</p>
        ) : null}
      </div>
    </div>
  );
}
