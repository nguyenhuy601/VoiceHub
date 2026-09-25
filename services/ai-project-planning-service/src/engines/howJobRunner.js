/**

 * @deprecated Removed — use runHowPhaseTools / runToolsSequence.

 */

async function runHowJob() {

  const err = new Error('howJobRunner removed — use runHowPhaseTools');

  err.code = 'PHASE_ONLY_RUNS';

  throw err;

}



module.exports = { runHowJob, HOW_JOBS: new Set() };

