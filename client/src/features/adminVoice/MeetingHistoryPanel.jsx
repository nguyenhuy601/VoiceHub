import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { useAppStrings } from '../../locales/appStrings';
import useAdminMeetings from '../../hooks/useAdminMeetings';
import {
  adminDenseRowClass,
  adminManageLinkClass,
  adminPrimaryBtnClass,
  AdminDenseTableCard,
  AdminDenseTableScroll,
} from '../../components/adminUsers/adminUserPanelUi';
import {
  formatMeetingWhen,
  meetingId,
  meetingStatus,
  meetingStatusLabel,
  meetingTitle,
} from '../../utils/adminVoiceUtils';
import { adminMeetingHubLink } from '../../utils/adminHubLinks';

const MEETING_OPS_HUB = '/app/admin/voice/meeting-ops';

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
      <AdminDenseTableCard>
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
          <AdminDenseTableScroll>
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-10 bg-muted text-left text-xs uppercase text-muted-foreground backdrop-blur">
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
                    <tr key={id} className={adminDenseRowClass()}>
                      <td className="px-3 py-2 font-medium">{meetingTitle(m)}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {meetingStatusLabel(meetingStatus(m), t)}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {formatMeetingWhen(m.endedAt || m.startTime || m.createdAt, locale)}
                      </td>
                      <td className="px-3 py-2">
                        <Link
                          to={adminMeetingHubLink(MEETING_OPS_HUB, id, 'recording')}
                          className={adminManageLinkClass()}
                        >
                          {t('adminDomains.voice.meetingOpsHub')}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!filtered.length ? (
              <p className="px-3 py-4 text-sm text-muted-foreground">{t('adminVoice.noMeetings')}</p>
            ) : null}
          </AdminDenseTableScroll>
        )}
      </AdminDenseTableCard>
    </div>
  );
}
