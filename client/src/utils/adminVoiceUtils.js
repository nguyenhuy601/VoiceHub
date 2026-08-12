export function unwrapMeetingsPayload(payload) {
  const body = payload?.data ?? payload;
  const data = body?.data ?? body;
  if (Array.isArray(data?.meetings)) return data.meetings;
  if (Array.isArray(data)) return data;
  if (Array.isArray(body?.meetings)) return body.meetings;
  return [];
}

export function meetingId(meeting) {
  return String(meeting?._id || meeting?.id || '').trim();
}

export function meetingTitle(meeting) {
  return String(meeting?.title || meeting?.name || 'Meeting').trim() || 'Meeting';
}

export function meetingStatus(meeting) {
  return String(meeting?.status || '').trim().toLowerCase() || 'unknown';
}

export function isActiveMeeting(meeting) {
  const s = meetingStatus(meeting);
  return s === 'active' || s === 'ongoing' || s === 'in_progress' || meeting?.active === true;
}

export function flattenStructureChannels(structure) {
  const channels = [];
  const pushChannels = (list, scopeName) => {
    for (const ch of list || []) {
      channels.push(scopeName ? { ...ch, _scopeName: scopeName } : ch);
    }
  };

  const branches = structure?.branches || (Array.isArray(structure) ? structure : []);
  for (const branch of branches) {
    for (const division of branch?.divisions || structure?.divisions || []) {
      pushChannels(division?.channels, division?.name);
      for (const department of division?.departments || []) {
        pushChannels(department?.channels, department?.name);
        for (const team of department?.teams || []) {
          pushChannels(team?.channels, team?.name);
        }
      }
    }
  }
  // Flat fallbacks
  for (const department of structure?.departments || []) {
    pushChannels(department?.channels, department?.name);
    for (const team of department?.teams || []) pushChannels(team?.channels, team?.name);
  }
  for (const team of structure?.teams || []) pushChannels(team?.channels, team?.name);
  pushChannels(structure?.channels);

  const map = new Map();
  for (const ch of channels) {
    const id = String(ch._id || ch.id || '').trim();
    if (id) map.set(id, ch);
  }
  return [...map.values()];
}

export function voiceChannelsOnly(channels) {
  return (channels || []).filter((ch) => String(ch.type || '').toLowerCase() === 'voice');
}

export function formatMeetingWhen(value, locale = 'vi') {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
