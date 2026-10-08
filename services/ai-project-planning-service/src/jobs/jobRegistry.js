/**

 * Legacy job registry removed from execute SoT (phase-only).

 * Kept as empty metadata surface so old requires do not crash.

 */



const PHASE_JOBS = Object.freeze(['phase_what', 'phase_how']);

const SUPPORTED_JOBS = new Set(PHASE_JOBS);



function listJobs() {

  return [...PHASE_JOBS];

}



function getJob() {

  return null;

}



async function runJob() {

  const err = new Error('Phase-only: per-job runJob is removed');

  err.code = 'PHASE_ONLY_RUNS';

  throw err;

}



function registerJob() {

  const err = new Error('Phase-only: registerJob is removed');

  err.code = 'PHASE_ONLY_RUNS';

  throw err;

}



function _resetHowJobsForTests() {}



module.exports = {

  registerJob,

  getJob,

  listJobs,

  runJob,

  SUPPORTED_JOBS,

  HOW_JOBS: new Set(),

  HOW_JOB_NAMES: [],

  USER_JOBS: new Set(),

  USER_JOB_NAMES: [],

  listMappedJobs: listJobs,

  _resetHowJobsForTests,

};

