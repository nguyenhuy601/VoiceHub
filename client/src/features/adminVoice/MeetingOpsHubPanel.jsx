import { useMemo } from 'react';
import { useAppStrings } from '../../locales/appStrings';
import AdminMeetingOpsHubShell from '../../components/Admin/AdminMeetingOpsHubShell';
import MeetingEndPanel from './MeetingEndPanel';
import MeetingModeratePanel from './MeetingModeratePanel';

const TAB_MODERATE = 'moderate';
const TAB_END = 'end';

export default function MeetingOpsHubPanel({ orgId }) {
  const { t } = useAppStrings();

  const tabs = useMemo(
    () => [
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
      defaultTab={TAB_MODERATE}
      pickerHint={t('adminVoice.meetingOpsPickerHint')}
      activeOnly={false}
    >
      {({ activeTab }) => (
        <>
          {activeTab === TAB_MODERATE ? <MeetingModeratePanel orgId={orgId} embedded /> : null}
          {activeTab === TAB_END ? <MeetingEndPanel orgId={orgId} embedded /> : null}
        </>
      )}
    </AdminMeetingOpsHubShell>
  );
}
