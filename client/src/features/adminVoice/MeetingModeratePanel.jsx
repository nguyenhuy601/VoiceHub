import { Link, useSearchParams } from 'react-router-dom';
import AdminMeetingPicker from '../../components/adminVoice/AdminMeetingPicker';
import { GradientButton } from '../../components/Shared';
import useAdminMeetings from '../../hooks/useAdminMeetings';
import { useAppStrings } from '../../locales/appStrings';
import { isActiveMeeting, meetingId, meetingTitle } from '../../utils/adminVoiceUtils';

export default function MeetingModeratePanel({ orgId }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const meetingIdParam = String(searchParams.get('meetingId') || '').trim();
  const { meetings } = useAdminMeetings(orgId);
  const meeting = meetings.find((m) => meetingId(m) === meetingIdParam);
  const participants = (meeting?.participants || []).filter((p) => !p.leftAt);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <AdminMeetingPicker
        orgId={orgId}
        selectedMeetingId={meetingIdParam}
        hint={t('adminVoice.moderatePickerHint')}
        activeOnly
      />
      <div className="rounded-xl border border-border bg-card/40 p-4">
        <h2 className="text-lg font-semibold">{t('adminDomains.voice.moderate')}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t('adminVoice.moderateHint')}</p>
        {!meeting ? (
          <p className="mt-4 text-sm text-muted-foreground">{t('adminVoice.selectMeetingFirst')}</p>
        ) : (
          <div className="mt-4 space-y-3">
            <p className="font-medium">{meetingTitle(meeting)}</p>
            <p className="text-xs text-muted-foreground">
              {isActiveMeeting(meeting) ? t('adminVoice.statusActive') : meeting.status} ·{' '}
              {t('adminVoice.participantsCount', { n: participants.length })}
            </p>
            <ul className="max-h-48 space-y-1 overflow-auto rounded-lg border border-border/60 p-2 text-sm">
              {participants.length ? (
                participants.map((p, i) => (
                  <li key={String(p.userId?._id || p.userId || i)} className="text-muted-foreground">
                    {String(p.userId?.displayName || p.displayName || p.userId || '—')}
                  </li>
                ))
              ) : (
                <li className="text-muted-foreground">{t('adminVoice.noParticipants')}</li>
              )}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Link to={`/app/admin/voice/end-meeting?meetingId=${encodeURIComponent(meetingIdParam)}`}>
                <GradientButton type="button">{t('adminDomains.voice.endMeeting')}</GradientButton>
              </Link>
              <Link
                to={`/app/communicate/voice?meetingId=${encodeURIComponent(meetingIdParam)}`}
                className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted/40"
              >
                {t('adminVoice.openVoiceRoom')}
              </Link>
            </div>
            <p className="text-xs text-amber-200/90">{t('adminVoice.moderateLimitation')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
