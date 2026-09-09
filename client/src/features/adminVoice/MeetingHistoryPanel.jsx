import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { useAppStrings } from '../../locales/appStrings';
import useAdminMeetings from '../../hooks/useAdminMeetings';
import { adminPrimaryBtnClass } from '../../components/adminUsers/adminUserPanelUi';
import {
  formatMeetingWhen,
  meetingId,
  meetingStatus,
  meetingTitle,
} from '../../utils/adminVoiceUtils';

export default function MeetingHistoryPanel({ orgId }) {
  const { t, locale } = useAppStrings();
  const { meetings, loading, error, loadMeetings } = useAdminMeetings(orgId, { status: 'ended' });
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return meetings;
    return meetings.filter((m) => meetingTitle(m).toLowerCase().includes(q));
  }, [meetings, query]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{t('adminDomains.voice.history')}</h2>
        <p className="text-sm text-muted-foreground">{t('adminVoice.historyHint')}</p>
      </div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('adminVoice.searchMeeting')}
        className="w-full max-w-md rounded-lg border border-border bg-background px-3 py-2 text-sm"
      />
      <div className="overflow-auto rounded-xl border border-border">
        {loading ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : error ? (
          <div className="space-y-3 px-3 py-4">
            <p className="text-sm text-destructive">{error}</p>
            <button type="button" className={adminPrimaryBtnClass()} onClick={() => loadMeetings()}>
              {t('adminRbac.retry')}
            </button>
          </div>
        ) : (
          <>
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
                        {formatMeetingWhen(m.endedAt || m.startTime || m.createdAt, locale)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          <Link
                            to={`/app/admin/voice/recording?meetingId=${encodeURIComponent(id)}`}
                            className="rounded border border-border px-2 py-0.5 text-xs hover:bg-muted/40"
                          >
                            {t('adminDomains.voice.recording')}
                          </Link>
                          <Link
                            to={`/app/admin/voice/transcript?meetingId=${encodeURIComponent(id)}`}
                            className="rounded border border-border px-2 py-0.5 text-xs hover:bg-muted/40"
                          >
                            {t('adminDomains.voice.transcript')}
                          </Link>
                          <Link
                            to={`/app/admin/voice/ai-summary?meetingId=${encodeURIComponent(id)}`}
                            className="rounded border border-border px-2 py-0.5 text-xs hover:bg-muted/40"
                          >
                            {t('adminDomains.voice.aiSummary')}
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!filtered.length ? (
              <p className="px-3 py-4 text-sm text-muted-foreground">{t('adminVoice.noMeetings')}</p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
