import { useMemo } from 'react';
import { useAppStrings } from '../../locales/appStrings';
import AdminMeetingOpsHubShell from '../../components/admin/AdminMeetingOpsHubShell';
import MeetingEndPanel from './MeetingEndPanel';
import MeetingModeratePanel from './MeetingModeratePanel';
import {
  MeetingRecordingPanel,
  MeetingTranscriptPanel,
  MeetingAiSummaryPanel,
} from './MeetingArtifactPanels';

const TAB_RECORDING = 'recording';
const TAB_TRANSCRIPT = 'transcript';
const TAB_SUMMARY = 'summary';
const TAB_MODERATE = 'moderate';
const TAB_END = 'end';

export default function MeetingOpsHubPanel({ orgId }) {
  const { t } = useAppStrings();

  const tabs = useMemo(
    () => [
      { id: TAB_RECORDING, label: t('adminDomains.voice.recording') },
      { id: TAB_TRANSCRIPT, label: t('adminDomains.voice.transcript') },
      { id: TAB_SUMMARY, label: t('adminDomains.voice.aiSummary') },
      { id: TAB_MODERATE, label: t('adminDomains.voice.moderate') },
      { id: TAB_END, label: t('adminDomains.voice.endMeeting') },
    ],
    [t]
  );

  return (
    <AdminMeetingOpsHubShell
      title={t('adminDomains.voice.meetingOpsHub')}
      hint={t('adminVoice.meetingOpsHubHint')}
      orgId={orgId}
      tabs={tabs}
      defaultTab={TAB_RECORDING}
      pickerHint={t('adminVoice.meetingOpsPickerHint')}
      activeOnly={false}
    >
      {({ activeTab }) => (
        <>
          {activeTab === TAB_RECORDING ? <MeetingRecordingPanel orgId={orgId} embedded /> : null}
          {activeTab === TAB_TRANSCRIPT ? <MeetingTranscriptPanel orgId={orgId} embedded /> : null}
          {activeTab === TAB_SUMMARY ? <MeetingAiSummaryPanel orgId={orgId} embedded /> : null}
          {activeTab === TAB_MODERATE ? <MeetingModeratePanel orgId={orgId} embedded /> : null}
          {activeTab === TAB_END ? <MeetingEndPanel orgId={orgId} embedded /> : null}
        </>
      )}
    </AdminMeetingOpsHubShell>
  );
}
