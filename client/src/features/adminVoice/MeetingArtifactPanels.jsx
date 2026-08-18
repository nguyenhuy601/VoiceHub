import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminMeetingPicker from '../../components/adminVoice/AdminMeetingPicker';
import { GradientButton } from '../../components/Shared';
import { adminPrimaryBtnClass } from '../../components/adminUsers/adminUserPanelUi';
import { getMeetingRecording, fetchMeetingRecordingStream } from '../../services/meetingRecordingAPI';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';

/**
 * mode: 'recording' | 'transcript' | 'summary'
 */
export default function MeetingArtifactPanel({ orgId, mode, embedded = false }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const meetingId = String(searchParams.get('meetingId') || '').trim();
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [reloadTick, setReloadTick] = useState(0);
  const [audioUrl, setAudioUrl] = useState('');

  const titles = {
    recording: t('adminDomains.voice.recording'),
    transcript: t('adminDomains.voice.transcript'),
    summary: t('adminDomains.voice.aiSummary'),
  };
  const hints = {
    recording: t('adminVoice.recordingHint'),
    transcript: t('adminVoice.transcriptHint'),
    summary: t('adminVoice.summaryHint'),
  };

  useEffect(() => {
    if (!meetingId) {
      setPayload(null);
      setAudioUrl('');
      setLoadError('');
      return;
    }
    let cancelled = false;
    let objectUrl = '';
    (async () => {
      setLoading(true);
      setLoadError('');
      try {
        const res = await getMeetingRecording(meetingId);
        const data = res?.data?.data ?? res?.data ?? res;
        if (cancelled) return;
        setPayload(data);
        if (mode === 'recording' && data?.hasAudio) {
          const blobRes = await fetchMeetingRecordingStream(meetingId);
          const blob = blobRes?.data instanceof Blob ? blobRes.data : blobRes;
          objectUrl = URL.createObjectURL(blob);
          if (!cancelled) setAudioUrl(objectUrl);
        } else {
          setAudioUrl('');
        }
      } catch (error) {
        if (!cancelled) {
          setPayload(null);
          setAudioUrl('');
          const msg = resolveApiErrorMessage(error, { t, fallback: t('adminVoice.artifactLoadFail') });
          setLoadError(msg);
          toast.error(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [meetingId, mode, t, reloadTick]);

  const downloadAudio = () => {
    if (!audioUrl) return;
    const a = document.createElement('a');
    a.href = audioUrl;
    a.download = `meeting-${meetingId}.webm`;
    a.click();
  };

  const body = (
    <div className="rounded-xl border border-border bg-card/40 p-4">
      <h2 className="text-lg font-semibold">{titles[mode]}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{hints[mode]}</p>
      {!meetingId ? (
        <p className="mt-4 text-sm text-muted-foreground">{t('adminVoice.selectMeetingFirst')}</p>
      ) : loading ? (
        <p className="mt-4 text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : loadError ? (
        <div className="mt-4 space-y-3">
          <p className="rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {loadError}
          </p>
          <button type="button" className={adminPrimaryBtnClass()} onClick={() => setReloadTick((n) => n + 1)}>
            {t('adminRbac.retry')}
          </button>
        </div>
      ) : !payload ? (
        <p className="mt-4 text-sm text-muted-foreground">{t('adminVoice.noArtifact')}</p>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span>recording: {payload.recordingStatus || '—'}</span>
            <span>transcript: {payload.hasTranscript ? 'yes' : 'no'}</span>
            <span>summary: {payload.summaryStatus || (payload.hasSummary ? 'ready' : '—')}</span>
          </div>
          {mode === 'recording' ? (
            audioUrl ? (
              <div className="space-y-2">
                <audio controls src={audioUrl} className="w-full" />
                <GradientButton type="button" variant="secondary" onClick={downloadAudio}>
                  {t('adminVoice.downloadRecording')}
                </GradientButton>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t('adminVoice.noAudio')}</p>
            )
          ) : null}
          {mode === 'transcript' ? (
            <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-lg border border-border/60 bg-background/50 p-3 text-xs">
              {payload.transcript || t('adminVoice.noTranscript')}
            </pre>
          ) : null}
          {mode === 'summary' ? (
            <div className="space-y-2">
              <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-lg border border-border/60 bg-background/50 p-3 text-sm">
                {payload.summary || payload.summaryPreview || t('adminVoice.noSummary')}
              </pre>
              {payload.summaryStructured ? (
                <pre className="max-h-40 overflow-auto rounded-lg border border-border/40 p-2 text-[11px] text-muted-foreground">
                  {JSON.stringify(payload.summaryStructured, null, 2)}
                </pre>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );

  if (embedded) return body;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
      <AdminMeetingPicker orgId={orgId} selectedMeetingId={meetingId} hint={hints[mode]} />
      {body}
    </div>
  );
}

export function MeetingRecordingPanel({ orgId, embedded = false }) {
  return <MeetingArtifactPanel orgId={orgId} mode="recording" embedded={embedded} />;
}

export function MeetingTranscriptPanel({ orgId, embedded = false }) {
  return <MeetingArtifactPanel orgId={orgId} mode="transcript" embedded={embedded} />;
}

export function MeetingAiSummaryPanel({ orgId, embedded = false }) {
  return <MeetingArtifactPanel orgId={orgId} mode="summary" embedded={embedded} />;
}
