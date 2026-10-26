/**
 * Stub handler for foundation tests — echoes payload.echo or { ok: true, jobType }.
 */

async function handleEchoStub(job) {
  const payload = job.payload && typeof job.payload === 'object' ? job.payload : {};
  if (payload.echo != null) {
    return { ok: true, echo: payload.echo, jobType: job.jobType };
  }
  return { ok: true, jobType: job.jobType, stub: true };
}

module.exports = { handleEchoStub };
