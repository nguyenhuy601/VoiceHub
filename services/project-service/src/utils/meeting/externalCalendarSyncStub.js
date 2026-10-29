/**
 * normalizeCatalog stub — external calendar sync (Google/Outlook) not implemented.
 * SoT remains project MeetingEvent; sync is inbound/outbound adapter later.
 */

function getExternalCalendarSyncStatus() {
  return {
    enabled: false,
    providers: [],
    note: 'External calendar sync deferred to normalizeCatalog — MeetingEvent is SoT',
  };
}

/** No-op pull — never invents events. */
async function pullExternalBusySlots(_opts = {}) {
  return { slots: [], source: 'stub', invented: false };
}

module.exports = {
  getExternalCalendarSyncStatus,
  pullExternalBusySlots,
};
