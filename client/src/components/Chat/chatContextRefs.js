export const CONTEXT_REF_KINDS = ['task', 'change_request'];

export function normalizeMessageRefs(message) {
  const raw = Array.isArray(message?.refs) ? message.refs : [];
  return raw
    .map((row) => {
      const kind = String(row?.kind || '').trim();
      const id = String(row?.id || row?._id || '').trim();
      const projectId = String(row?.projectId || '').trim();
      if (!CONTEXT_REF_KINDS.includes(kind) || !id || !projectId) return null;
      const label = String(row?.label || '').trim();
      return { kind, id, projectId, ...(label ? { label } : {}) };
    })
    .filter(Boolean);
}

export function contextCallTargetFromMessage(message) {
  if (String(message?.visibility?.mode || '') !== 'project_intersection') return null;
  const projectId = String(message?.visibility?.projectId || '').trim();
  if (!projectId) return null;
  const label = String(message?.visibility?.projectName || '').trim();
  return { kind: 'project', id: projectId, projectId, ...(label ? { label } : {}) };
}

export function previewCacheKey(target) {
  const projectId = String(target?.projectId || '').trim();
  const kind = String(target?.kind || 'project').trim() || 'project';
  const id = String(target?.id || '').trim();
  return `${projectId}:${kind}:${id}`;
}
