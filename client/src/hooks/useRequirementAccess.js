import { useCallback, useEffect, useState } from 'react';
import { requirementAPI } from '../services/api/requirementAPI';
import { normalizeRequirementAccess } from '../utils/requirementAccessUtils';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

export default function useRequirementAccess(organizationId) {
  const orgId = String(organizationId || '').trim();
  const [access, setAccess] = useState(() => normalizeRequirementAccess(null));
  const [loading, setLoading] = useState(Boolean(orgId));
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    if (!orgId) {
      setAccess(normalizeRequirementAccess(null));
      setLoading(false);
      setLoaded(true);
      return;
    }
    setLoading(true);
    try {
      const res = await requirementAPI.getAccess(orgId);
      setAccess(normalizeRequirementAccess(unwrap(res)));
    } catch {
      setAccess(normalizeRequirementAccess(null));
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [orgId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { access, loading, loaded, reload };
}
