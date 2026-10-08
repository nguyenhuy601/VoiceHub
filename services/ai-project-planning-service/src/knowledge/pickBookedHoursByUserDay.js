/**
 * Single SoT picker for HOW booked hours — never invents an empty map.
 * Prefer toolData.bookedHoursByUserDay, then snapshot.bookedHoursByUserDay,
 * then legacy meetingHoursByUserDay on either side.
 */

function isNonEmptyHoursMap(value) {
  return (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length > 0
  );
}

/**
 * @param {object|null|undefined} base — existing toolData
 * @param {object|null|undefined} snap — snapshot payload
 * @returns {Record<string, number>|null}
 */
function pickBookedHoursByUserDay(base = null, snap = null) {
  if (isNonEmptyHoursMap(base?.bookedHoursByUserDay)) {
    return base.bookedHoursByUserDay;
  }
  if (isNonEmptyHoursMap(snap?.bookedHoursByUserDay)) {
    return snap.bookedHoursByUserDay;
  }
  if (isNonEmptyHoursMap(base?.meetingHoursByUserDay)) {
    return base.meetingHoursByUserDay;
  }
  if (isNonEmptyHoursMap(snap?.meetingHoursByUserDay)) {
    return snap.meetingHoursByUserDay;
  }
  return null;
}

module.exports = {
  pickBookedHoursByUserDay,
  isNonEmptyHoursMap,
};
