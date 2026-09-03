import { useEffect, useMemo, useState } from 'react';
import { organizationAPI } from '../services/api/organizationAPI';
import { SKILL_WHITELIST } from '../constants/capabilityCatalog';
import { unwrapApiData } from '../utils/helpers';

/**
 * Org-scoped skill catalog — ACTIVE skills từ Skill Registry, fallback whitelist tĩnh.
 * @param {string|null|undefined} organizationId
 * @param {{ status?: string, limit?: number }} [options]
 */
export default function useOrgSkillCatalog(organizationId, options = {}) {
  const status = options.status || 'ACTIVE';
  const limit = options.limit || 200;
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(Boolean(organizationId));
  const [fromRegistry, setFromRegistry] = useState(false);

  useEffect(() => {
    const orgId = String(organizationId || '').trim();
    if (!orgId) {
      setSkills([]);
      setFromRegistry(false);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);

    organizationAPI
      .listSkills(orgId, { status, limit })
      .then((res) => {
        if (cancelled) return;
        const payload = unwrapApiData(res);
        const rows = Array.isArray(payload?.skills)
          ? payload.skills
          : Array.isArray(payload?.items)
            ? payload.items
            : Array.isArray(payload)
              ? payload
              : [];
        const mapped = rows
          .map((row) => ({
            id: String(row?._id || row?.id || row?.skillId || '').trim(),
            name: String(row?.name || '').trim(),
          }))
          .filter((row) => row.name);
        if (mapped.length) {
          setSkills(mapped);
          setFromRegistry(true);
        } else {
          setSkills(SKILL_WHITELIST.map((name) => ({ id: '', name })));
          setFromRegistry(false);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setSkills(SKILL_WHITELIST.map((name) => ({ id: '', name })));
        setFromRegistry(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [organizationId, status, limit]);

  const skillNames = useMemo(() => skills.map((s) => s.name), [skills]);

  const skillByName = useMemo(() => {
    const map = new Map();
    for (const skill of skills) {
      if (skill.name) map.set(skill.name, skill);
    }
    return map;
  }, [skills]);

  return { skills, skillNames, skillByName, loading, fromRegistry };
}
