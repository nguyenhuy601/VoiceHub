import apiClient from './apiClient';
import { organizationAPI } from './organizationAPI';

function withOrg(organizationId, config = {}) {
  const orgId = String(organizationId || '').trim();
  return {
    ...config,
    headers: {
      ...(config.headers || {}),
      ...(orgId ? { 'x-organization-id': orgId } : {}),
    },
    params: {
      ...(config.params || {}),
      ...(orgId ? { organizationId: orgId } : {}),
    },
  };
}

export const requirementAPI = {
  downloadTemplate: async (organizationId) => {
    // apiClient interceptor already returns response.data (Blob when responseType: 'blob')
    return apiClient.get('/projects/requirements/import/template', {
      ...withOrg(organizationId),
      responseType: 'blob',
      skipGlobalErrorHandling: true,
    });
  },

  previewImport: (organizationId, file) => {
    const form = new FormData();
    form.append('file', file);
    return apiClient.post('/projects/requirements/import/preview', form, {
      ...withOrg(organizationId),
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  confirmImport: (organizationId, sessionId) =>
    apiClient.post(
      '/projects/requirements/import/confirm',
      { sessionId },
      withOrg(organizationId)
    ),

  listPacks: (organizationId, params = {}) =>
    apiClient.get('/projects/requirements', withOrg(organizationId, { params })),

  getAccess: (organizationId) =>
    apiClient.get('/projects/requirements/access', withOrg(organizationId)),

  getPack: (organizationId, packId, options = {}) => {
    const view = String(options.view || '').trim();
    return apiClient.get(
      `/projects/requirements/${encodeURIComponent(packId)}`,
      withOrg(organizationId, {
        params: view ? { view } : {},
      })
    );
  },

  downloadSourceFile: (organizationId, packId) =>
    apiClient.get(`/projects/requirements/${encodeURIComponent(packId)}/source-file`, {
      ...withOrg(organizationId),
      responseType: 'blob',
      skipGlobalErrorHandling: true,
    }),

  submitPack: (organizationId, packId) =>
    apiClient.post(
      `/projects/requirements/${encodeURIComponent(packId)}/submit`,
      {},
      withOrg(organizationId)
    ),

  approvePack: (organizationId, packId) =>
    apiClient.post(
      `/projects/requirements/${encodeURIComponent(packId)}/approve`,
      {},
      withOrg(organizationId)
    ),

  rejectPack: (organizationId, packId, reason = '') =>
    apiClient.post(
      `/projects/requirements/${encodeURIComponent(packId)}/reject`,
      { reason },
      withOrg(organizationId)
    ),

  deletePack: (organizationId, packId) =>
    apiClient.delete(
      `/projects/requirements/${encodeURIComponent(String(packId || '').trim())}`,
      {
        ...withOrg(organizationId),
        skipNotFoundToast: true,
      }
    ),

  createProjectFromPack: (organizationId, packId, body = {}) =>
    apiClient.post(
      `/projects/requirements/${encodeURIComponent(packId)}/create-project`,
      body,
      {
        ...withOrg(organizationId),
        timeout: 300000,
      }
    ),

  runAiPlanning: (organizationId, packId, options = {}) => {
    const phase = options.phase;
    const body = phase ? { phase } : {};
    return apiClient.post(
      `/projects/requirements/${encodeURIComponent(packId)}/ai-planning/run`,
      body,
      {
        ...withOrg(organizationId),
        timeout: options.timeout ?? 300000,
      }
    );
  },

  approveAiStaffing: (organizationId, packId) =>
    apiClient.post(
      `/projects/requirements/${encodeURIComponent(packId)}/ai-planning/approve-staffing`,
      {},
      withOrg(organizationId)
    ),

  discardAiStaffing: (organizationId, packId) =>
    apiClient.post(
      `/projects/requirements/${encodeURIComponent(packId)}/ai-planning/discard-staffing`,
      {},
      withOrg(organizationId)
    ),

  listSkills: (organizationId, params = {}) =>
    organizationAPI.listSkills(organizationId, params),

  reviewSkill: (organizationId, skillId, body = {}) =>
    organizationAPI.reviewSkill(organizationId, skillId, body),
};
