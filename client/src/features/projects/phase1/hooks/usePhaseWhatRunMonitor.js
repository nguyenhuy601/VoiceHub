/**
 * Poll phase_what job until pack ready/failed — no hard wall failure (Wave 1).
 */

const POLL_MS = 2000;
const SOFT_HINT_MS = 180_000;

/**
 * @param {{
 *   refresh: () => Promise<object|null>,
 *   getLive?: () => Promise<object|null>,
 *   signal?: AbortSignal,
 *   onTick?: (info: object) => void,
 *   pollMs?: number,
 *   softHintMs?: number,
 * }} opts
 */
export async function waitForPhaseWhatJob(opts = {}) {
  const refresh = opts.refresh;
  const onTick = opts.onTick || (() => {});
  const pollMs = opts.pollMs ?? POLL_MS;
  const softHintMs = opts.softHintMs ?? SOFT_HINT_MS;
  const signal = opts.signal;
  const started = Date.now();
  let softHintSent = false;

  for (;;) {
    if (signal?.aborted) {
      const err = new Error('aborted');
      err.code = 'PHASE_WHAT_ABORTED';
      throw err;
    }
    const pack = await refresh();
    const phaseWhat = pack?.aiAnalysis?.phaseRuns?.phase_what || {};
    const liveRun = pack?.liveRun || null;
    const status = String(phaseWhat.status || '');
    const computeStatus = String(
      liveRun?.computeStatus || phaseWhat.computeStatus || ''
    );
    const callbackStatus = String(
      liveRun?.callbackStatus || phaseWhat.callbackStatus || ''
    );
    const stage = String(liveRun?.stage || phaseWhat.stage || liveRun?.currentNode || '');
    const liveStatus = String(liveRun?.status || '');
    const gate = String(liveRun?.gate || '');
    const tick = {
      pack,
      phaseWhat,
      liveRun,
      status,
      computeStatus,
      callbackStatus,
      stage,
      pipelineStep: liveRun?.pipelineStep ?? null,
      pipelineSubstep: liveRun?.pipelineSubstep || '',
      gate,
      liveStatus,
      elapsedMs: Date.now() - started,
      softHint: softHintSent,
    };

    onTick(tick);

    if (liveStatus === 'waiting_human' && gate === 'data_review') {
      return { ok: false, awaitingGate: 'data_review', pack, phaseWhat, liveRun };
    }

    if (status === 'ready') {
      return { ok: true, pack, phaseWhat, liveRun };
    }
    if (status === 'failed') {
      const err = new Error(
        phaseWhat?.error?.message || liveRun?.error?.message || 'G4 Understanding failed'
      );
      err.code = 'PHASE_WHAT_FAILED';
      err.phaseWhat = phaseWhat;
      throw err;
    }

    if (!softHintSent && Date.now() - started >= softHintMs) {
      softHintSent = true;
      onTick({
        ...tick,
        elapsedMs: Date.now() - started,
        softHint: true,
      });
    }

    await new Promise((r) => setTimeout(r, pollMs));
  }
}

export default waitForPhaseWhatJob;
