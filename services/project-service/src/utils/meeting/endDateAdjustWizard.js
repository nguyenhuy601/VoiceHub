/**
 * sourceManifest — preview future MeetingEvent / plan lines affected by project end-date change.
 * Does not write — PM confirms apply separately.
 */

function previewEventsAffectedByEndDate({ events = [], newEndDate } = {}) {
  const end = new Date(newEndDate).getTime();
  if (!Number.isFinite(end)) {
    return { keep: [], dropOrReschedule: [], invalidEnd: true };
  }
  const keep = [];
  const dropOrReschedule = [];
  for (const ev of events) {
    if (String(ev.status || '').toLowerCase() === 'completed') {
      keep.push({ ...ev, action: 'immutable_completed' });
      continue;
    }
    if (String(ev.status || '').toLowerCase() === 'cancelled') {
      keep.push({ ...ev, action: 'skip_cancelled' });
      continue;
    }
    const start = new Date(ev.startAt).getTime();
    if (!Number.isFinite(start)) continue;
    if (start > end) {
      dropOrReschedule.push({
        eventId: ev.id || ev._id,
        title: ev.title,
        startAt: ev.startAt,
        suggestedAction: 'cancel_or_move',
      });
    } else {
      keep.push({ ...ev, action: 'keep' });
    }
  }
  return { keep, dropOrReschedule, invalidEnd: false };
}

module.exports = { previewEventsAffectedByEndDate };
