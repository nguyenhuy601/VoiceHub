import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAppStrings } from '../../locales/appStrings';
import { organizationAPI } from '../../services/api/organizationAPI';
import { projectAPI } from '../../services/api/projectAPI';
import ProjectsLandingGrid from '../../features/projects/landing/ProjectsLandingGrid';
import {
  buildCollaborateProjectHubPath,
  buildCollaborateProjectsNewPath,
  orgQueryFromSearch,
  readStoredLastOrganizationId,
} from '../../utils/suitePathUtils';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';

function unwrapProjectList(res) {
  const raw = res?.data?.projects ?? res?.projects ?? res?.data ?? res ?? [];
  return Array.isArray(raw) ? raw : [];
}

function isMyProject(project) {
  const mb = project?.myMembership;
  if (!mb) return true; // fallback for legacy payloads
  if (typeof mb.isMember === 'boolean') return mb.isMember;
  if (Array.isArray(mb.projectRoleKeys)) return mb.projectRoleKeys.length > 0;
  return true;
}

export default function ProjectsLandingPage() {
  const { t } = useAppStrings();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const orgId = orgQueryFromSearch(searchParams) || readStoredLastOrganizationId();
  const [orgName, setOrgName] = useState('');
  const [projects, setProjects] = useState([]);
  const [canCreate, setCanCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!orgId) {
      setProjects([]);
      setLoadError(false);
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    Promise.all([
      organizationAPI.getOrganization(orgId).catch(() => null),
      projectAPI.list({ organizationId: orgId }),
      organizationAPI.getTaskWorkspaceScope(orgId).catch(() => null),
    ])
      .then(([orgRes, listRes, scopeRes]) => {
        if (cancelled) return;
        const org = orgRes?.data?.data ?? orgRes?.data ?? orgRes;
        setOrgName(String(org?.name || '').trim());
        setProjects(unwrapProjectList(listRes).filter(isMyProject));
        const scope = scopeRes?.data?.data ?? scopeRes?.data ?? scopeRes;
        setCanCreate(Boolean(scope?.canCreateTask));
      })
      .catch((err) => {
        if (!cancelled) {
          setProjects([]);
          setLoadError(true);
          toast.error(resolveApiErrorMessage(err, t('taskBoard.loadBoardFail')));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, t, reloadToken]);

  const activeProjectsCount = useMemo(
    () =>
      projects.filter((p) => {
        const st = String(p?.status || '').toLowerCase();
        return p?.isActive !== false && !['closed', 'completed', 'archived'].includes(st);
      }).length,
    [projects]
  );

  const handleCreate = useCallback(() => {
    if (!orgId) {
      toast.error(t('organizations.selectOrgFirst'));
      return;
    }
    if (!canCreate) {
      toast.error(t('taskBoard.createBoardDenied'));
      return;
    }
    navigate(buildCollaborateProjectsNewPath(orgId, { from: 'hub' }));
  }, [canCreate, navigate, orgId, t]);

  const handleSelect = useCallback(
    (project) => {
      const projectId = String(project?._id || project?.projectId || '').trim();
      if (!projectId) return;
      const boardId = String(project?.defaultBoardId || project?.boards?.[0]?._id || '').trim();
      navigate(buildCollaborateProjectHubPath(projectId, { organizationId: orgId, boardId }));
    },
    [navigate, orgId]
  );

  if (!orgId) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-sm text-muted-foreground">
        {t('organizations.selectOrgFirst')}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t('common.loading')}
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted-foreground">{t('taskBoard.loadBoardFail')}</p>
        <button
          type="button"
          className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
          onClick={() => setReloadToken((n) => n + 1)}
        >
          {t('workspace.projectHubTimelineRetry')}
        </button>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0">
      <ProjectsLandingGrid
        organizationName={orgName}
        projects={projects}
        activeProjectsCount={activeProjectsCount}
        onCreateProject={canCreate ? handleCreate : undefined}
        onSelectProject={handleSelect}
      />
    </div>
  );
}
