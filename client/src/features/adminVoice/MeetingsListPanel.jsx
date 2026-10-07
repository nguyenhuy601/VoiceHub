import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { useAppStrings } from '../../locales/appStrings';
import useAdminMeetings from '../../hooks/useAdminMeetings';
import {
  adminDenseRowClass,
  adminManageLinkClass,
  adminPrimaryBtnClass,
  AdminDenseMobileList,
  AdminDenseTableCard,
  AdminDenseTableScroll,
} from '../../components/adminUsers/adminUserPanelUi';
import {
  formatMeetingWhen,
  isActiveMeeting,
  meetingId,
  meetingStatus,
  meetingStatusLabel,
  meetingTitle,
} from '../../utils/adminVoiceUtils';
import { adminMeetingHubLink } from '../../utils/adminHubLinks';

const MEETING_OPS_HUB = '/app/admin/voice/meeting-ops';
const STATUS_FILTER_OPTIONS = ['scheduled', 'active', 'ended'];

export default function MeetingsListPanel({ orgId }) {
  const { t, locale } = useAppStrings();
  const { meetings, loading, error, loadMeetings } = useAdminMeetings(orgId);
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
          aria-label={t('adminVoice.searchMeeting')}
          className="min-w-[200px] flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <select
          aria-label={t('adminVoice.filterAllStatus')}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">{t('adminVoice.filterAllStatus')}</option>
          {STATUS_FILTER_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {meetingStatusLabel(value, t)}
            </option>
          ))}
        </select>
      </div>
      <AdminDenseTableCard>
        {loading ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : error ? (
          <div className="space-y-3 px-3 py-4">
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
            <button type="button" className={adminPrimaryBtnClass()} onClick={() => loadMeetings()}>
              {t('adminRbac.retry')}
            </button>
          </div>
        ) : (
          <AdminDenseTableScroll>
            <AdminDenseMobileList
              items={filtered}
              getKey={meetingId}
              ariaLabel={t('adminDomains.voice.meetings')}
              renderTitle={(m) => meetingTitle(m)}
              renderMeta={(m) =>
                [
                  meetingStatusLabel(meetingStatus(m), t),
                  formatMeetingWhen(m.startTime || m.createdAt, locale),
                ].join(' · ')
              }
              renderActions={(m) => (
                <Link
                  to={adminMeetingHubLink(MEETING_OPS_HUB, meetingId(m), isActiveMeeting(m) ? 'moderate' : 'recording')}
                  className={adminManageLinkClass()}
                >
                  {t('adminDomains.voice.meetingOpsHub')}
                </Link>
              )}
            />
            <table className="hidden min-w-full text-sm md:table">
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
                  const manageTab = isActiveMeeting(m) ? 'moderate' : 'recording';
                  return (
                    <tr key={id} className={adminDenseRowClass()}>
                      <td className="px-3 py-2 font-medium">{meetingTitle(m)}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {meetingStatusLabel(meetingStatus(m), t)}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {formatMeetingWhen(m.startTime || m.createdAt, locale)}
                      </td>
                      <td className="px-3 py-2">
                        <Link
                          to={adminMeetingHubLink(MEETING_OPS_HUB, id, manageTab)}
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
