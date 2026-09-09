import { Link, useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import toast from 'react-hot-toast';
import AdminMeetingPicker from '../../components/adminVoice/AdminMeetingPicker';
import { GradientButton } from '../../components/Shared';
import { adminPrimaryBtnClass } from '../../components/adminUsers/adminUserPanelUi';
import meetingAPI from '../../services/api/meetingAPI';
import useAdminMeetings from '../../hooks/useAdminMeetings';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { isActiveMeeting, meetingId, meetingTitle } from '../../utils/adminVoiceUtils';

function participantUserId(p) {
  return String(p?.userId?._id || p?.userId || '').trim();
}

function participantLabel(p) {
  return String(p?.userId?.displayName || p?.displayName || participantUserId(p) || '—');
}

export default function MeetingModeratePanel({ orgId, embedded = false }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const meetingIdParam = String(searchParams.get('meetingId') || '').trim();
  const { meetings, loading, error, loadMeetings } = useAdminMeetings(orgId);
  const meeting = meetings.find((m) => meetingId(m) === meetingIdParam);
  const participants = (meeting?.participants || []).filter((p) => !p.leftAt);
  const [busyKey, setBusyKey] = useState('');

  const runModerate = async (targetId, action) => {
    if (!meetingIdParam || !targetId || busyKey) return;
    const name = participants.find((p) => participantUserId(p) === targetId);
    const label = name ? participantLabel(name) : targetId;
    if (action === 'kick' && !window.confirm(t('adminVoice.kickConfirm', { name: label }))) return;

    const key = `${action}:${targetId}`;
    setBusyKey(key);
    try {
      if (action === 'kick') {
        await meetingAPI.removeParticipant(meetingIdParam, targetId);
        toast.success(t('adminVoice.kicked'));
      } else if (action === 'mute') {
        await meetingAPI.muteParticipant(meetingIdParam, targetId, true);
        toast.success(t('adminVoice.muted'));
      } else if (action === 'unmute') {
        await meetingAPI.muteParticipant(meetingIdParam, targetId, false);
        toast.success(t('adminVoice.unmuted'));
      }
      await loadMeetings();
    } catch (error) {
      toast.error(
        resolveApiErrorMessage(error, {
          t,
          fallback: action === 'kick' ? t('adminVoice.kickFail') : t('adminVoice.muteFail'),
        })
      );
    } finally {
      setBusyKey('');
    }
  };

  const body = (
    <div className="rounded-xl border border-border bg-card/40 p-4">
      <h2 className="text-lg font-semibold">{t('adminDomains.voice.moderate')}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{t('adminVoice.moderateHint')}</p>
      {error ? (
        <div className="mt-4 space-y-3">
          <p className="rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
          <button type="button" className={adminPrimaryBtnClass()} onClick={() => loadMeetings()}>
            {t('adminRbac.retry')}
          </button>
        </div>
      ) : loading ? (
        <p className="mt-4 text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : !meeting ? (
        <p className="mt-4 text-sm text-muted-foreground">{t('adminVoice.selectMeetingFirst')}</p>
      ) : (
        <div className="mt-4 space-y-3">
          <p className="font-medium">{meetingTitle(meeting)}</p>
          <p className="text-xs text-muted-foreground">
            {isActiveMeeting(meeting) ? t('adminVoice.statusActive') : meeting.status} ·{' '}
            {t('adminVoice.participantsCount', { n: participants.length })}
          </p>
          <ul className="max-h-64 space-y-2 overflow-auto rounded-lg border border-border/60 p-2 text-sm">
            {participants.length ? (
              participants.map((p) => {
                const uid = participantUserId(p);
                const muted = Boolean(p.isMuted);
                return (
                  <li
                    key={uid || participantLabel(p)}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted/30"
                  >
                    <span className="min-w-0 text-foreground">
                      {participantLabel(p)}
                      {muted ? (
                        <span className="ml-2 text-[10px] uppercase text-amber-600 dark:text-amber-200">
                          {t('adminVoice.mutedBadge')}
                        </span>
                      ) : null}
                    </span>
                    <span className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        disabled={Boolean(busyKey) || !uid}
                        onClick={() => runModerate(uid, muted ? 'unmute' : 'mute')}
                        className="rounded border border-border px-2 py-0.5 text-xs hover:bg-muted/50 disabled:opacity-50"
                      >
                        {muted ? t('adminVoice.unmute') : t('adminVoice.mute')}
                      </button>
                      <button
                        type="button"
                        disabled={Boolean(busyKey) || !uid}
                        onClick={() => runModerate(uid, 'kick')}
                        className="rounded border border-red-500/40 px-2 py-0.5 text-xs text-red-600 hover:bg-red-500/10 disabled:opacity-50 dark:text-red-300"
                      >
                        {t('adminVoice.kick')}
                      </button>
                    </span>
                  </li>
                );
              })
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
        </div>
      )}
    </div>
  );

  if (embedded) return body;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <AdminMeetingPicker
        orgId={orgId}
        selectedMeetingId={meetingIdParam}
        hint={t('adminVoice.moderatePickerHint')}
        activeOnly
      />
      {body}
    </div>
  );
}
