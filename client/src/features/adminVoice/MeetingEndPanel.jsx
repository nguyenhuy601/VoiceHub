import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminMeetingPicker from '../../components/adminVoice/AdminMeetingPicker';
import { ConfirmDialog, GradientButton } from '../../components/Shared';
import meetingAPI from '../../services/api/meetingAPI';
import useAdminMeetings from '../../hooks/useAdminMeetings';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { isActiveMeeting, meetingId, meetingTitle } from '../../utils/adminVoiceUtils';

export default function MeetingEndPanel({ orgId }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const meetingIdParam = String(searchParams.get('meetingId') || '').trim();
  const { meetings, loadMeetings } = useAdminMeetings(orgId);
  const meeting = meetings.find((m) => meetingId(m) === meetingIdParam);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    if (!meetingIdParam || busy) return;
    setBusy(true);
    try {
      await meetingAPI.endMeeting(meetingIdParam);
      toast.success(t('adminVoice.ended'));
      setOpen(false);
      await loadMeetings();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminVoice.endFail') }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <AdminMeetingPicker
        orgId={orgId}
        selectedMeetingId={meetingIdParam}
        hint={t('adminVoice.endPickerHint')}
        activeOnly
      />
      <div className="rounded-xl border border-border bg-card/40 p-4">
        <h2 className="text-lg font-semibold">{t('adminDomains.voice.endMeeting')}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t('adminVoice.endHint')}</p>
        {!meeting ? (
          <p className="mt-4 text-sm text-muted-foreground">{t('adminVoice.selectMeetingFirst')}</p>
        ) : (
          <div className="mt-4 space-y-3">
            <p className="text-sm font-medium">{meetingTitle(meeting)}</p>
            <p className="text-xs text-muted-foreground">
              {isActiveMeeting(meeting) ? t('adminVoice.statusActive') : meeting.status}
            </p>
            <GradientButton type="button" disabled={busy} onClick={() => setOpen(true)}>
              {t('adminDomains.voice.endMeeting')}
            </GradientButton>
          </div>
        )}
      </div>
      <ConfirmDialog
        isOpen={open}
        onClose={() => !busy && setOpen(false)}
        onConfirm={confirm}
        title={t('adminDomains.voice.endMeeting')}
        message={t('adminVoice.endConfirm', { name: meeting ? meetingTitle(meeting) : '' })}
        confirmText={t('adminDomains.voice.endMeeting')}
        cancelText={t('common.cancel')}
      />
    </div>
  );
}
