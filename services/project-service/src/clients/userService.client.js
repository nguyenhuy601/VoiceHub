const axios = require('axios');

function internalAuth() {
  const base = String(process.env.USER_SERVICE_URL || '').trim().replace(/\/+$/, '');
  const token = String(process.env.USER_SERVICE_INTERNAL_TOKEN || '').trim();
  if (!base || !token) {
    const err = new Error('USER_SERVICE_URL or USER_SERVICE_INTERNAL_TOKEN is not set');
    err.code = 'NO_INTERNAL_TOKEN';
    throw err;
  }
  return { base, token };
}

async function fetchUserProfileByIdInternal(userId) {
  const { base, token } = internalAuth();
  return axios.get(`${base}/api/users/internal/profile/${encodeURIComponent(String(userId))}`, {
    headers: { 'x-internal-token': token },
    timeout: 10000,
  });
}

async function appendClosedBoardExperience(userId, experience) {
  const { base, token } = internalAuth();
  const exp = experience && typeof experience === 'object' ? experience : {};
  const response = await axios.post(
    `${base}/api/users/internal/profile/${encodeURIComponent(String(userId))}/bulk-fields`,
    {
      mode: 'append_closed_board',
      experience: {
        name: exp.name,
        role: exp.role,
        work: exp.work,
        year: exp.year,
        source: 'closed_board',
        status: 'suggested',
        evidenceBoardId: exp.evidenceBoardId,
      },
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'x-internal-token': token,
      },
      timeout: Number(process.env.USER_PROFILE_BULK_IMPORT_TIMEOUT_MS || 15000),
      validateStatus: () => true,
    }
  );
  if (response.status >= 400) {
    const msg = response.data?.message || response.data?.messageUser || 'append closed-board experience failed';
    const err = new Error(msg);
    err.statusCode = response.status;
    err.errorCode = response.data?.errorCode;
    throw err;
  }
  return response.data?.data ?? response.data;
}

module.exports = { fetchUserProfileByIdInternal, appendClosedBoardExperience };
