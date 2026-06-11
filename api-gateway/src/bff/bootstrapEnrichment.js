const { services, fetchJson, unwrapPayload } = require('./httpDownstream');

const ENRICH_TIMEOUT_MS = Math.min(
  8000,
  Math.max(3000, parseInt(process.env.BFF_DOWNSTREAM_TIMEOUT_MS || '7000', 10) || 7000)
);

async function sumTaskDoneForOrgs(orgIds, headers) {
  if (!orgIds.length) return { taskDone: null, failed: true };
  let total = 0;
  let failures = 0;
  const capped = orgIds.slice(0, 8);
  await Promise.all(
    capped.map(async (oid) => {
      const url = `${services.task.url}/api/tasks/statistics?organizationId=${encodeURIComponent(oid)}`;
      const res = await fetchJson(url, headers, `tasks/stats/${oid}`, ENRICH_TIMEOUT_MS);
      if (!res.ok) {
        failures += 1;
        return;
      }
      const stats = unwrapPayload(res.data);
      const done = Number(stats?.done);
      if (Number.isFinite(done)) total += done;
      else failures += 1;
    })
  );
  return {
    taskDone: failures === capped.length ? null : total,
    failed: failures === capped.length,
  };
}

async function fetchUpcomingMeetings(headers) {
  const startFrom = new Date();
  const startTo = new Date(startFrom.getTime() + 7 * 24 * 60 * 60 * 1000);
  const meetingsUrl = `${services.voice.url}/api/meetings?startFrom=${encodeURIComponent(startFrom.toISOString())}&startTo=${encodeURIComponent(startTo.toISOString())}&limit=8`;
  const meetingsRes = await fetchJson(meetingsUrl, headers, 'meetings', ENRICH_TIMEOUT_MS);
  if (!meetingsRes.ok) return { upcomingMeetings: [], failed: true };
  const inner = unwrapPayload(meetingsRes.data);
  const meetings = inner?.meetings ?? inner?.data?.meetings;
  if (!Array.isArray(meetings)) return { upcomingMeetings: [], failed: false };
  return {
    upcomingMeetings: meetings.slice(0, 5).map((m) => ({
      id: m._id,
      title: m.title,
      startTime: m.startTime,
      participants: Array.isArray(m.participants) ? m.participants.length : 0,
    })),
    failed: false,
  };
}

function normalizeBootstrapSuite(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'communicate' || s === 'collaborate' || s === 'me') return s;
  return '';
}

async function buildSuiteEnrichment(suite, organizations, headers) {
  const normalized = normalizeBootstrapSuite(suite);
  if (!normalized || normalized === 'me') {
    return { enrichment: null, partialEnrichment: {} };
  }

  const orgIds = (Array.isArray(organizations) ? organizations : [])
    .map((o) => String(o?._id || o?.id || '').trim())
    .filter((id) => /^[a-f\d]{24}$/i.test(id));

  if (normalized === 'communicate') {
    const { upcomingMeetings, failed } = await fetchUpcomingMeetings(headers);
    return {
      enrichment: { upcomingMeetings, taskDoneByOrg: null },
      partialEnrichment: { meetings: failed },
    };
  }

  if (normalized === 'collaborate') {
    const { taskDone, failed } = await sumTaskDoneForOrgs(orgIds, headers);
    return {
      enrichment: { upcomingMeetings: [], taskDoneByOrg: taskDone },
      partialEnrichment: { tasks: failed },
    };
  }

  return { enrichment: null, partialEnrichment: {} };
}

module.exports = { normalizeBootstrapSuite, buildSuiteEnrichment };
