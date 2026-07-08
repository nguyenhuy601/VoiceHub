import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
  buildCollaborateTasksPath,
  buildCommunicateChannelsPath,
  readStoredLastOrganizationId,
  writeStoredLastOrganizationId,
} from '../utils/suitePathUtils';
import {
  readCompanySnapshot,
  readSingleOrgModeFlag,
  resolveCompanyFromBootstrap,
} from '../utils/singleCompanyMode';

const LAST_WORKSPACE_SLUG_KEY = 'voicehub:last-workspace-slug';

function readStoredLastWorkspaceSlug() {
  if (typeof window === 'undefined') return '';
  return String(window.localStorage.getItem(LAST_WORKSPACE_SLUG_KEY) || '').trim();
}

const WorkspaceContext = createContext({
  activeWorkspace: null,
  setActiveWorkspace: () => {},
  lastWorkspaceSlug: '',
  lastOrganizationId: '',
  singleOrgMode: false,
  company: null,
  applyBootstrapCompany: () => {},
  setLastWorkspaceSlug: () => {},
  getLastWorkspacePath: () => '/app/collaborate/workspaces',
  getLastCommunicatePath: () => '/app/communicate/channels',
  getLastCollaboratePath: () => '/app/collaborate/workspaces',
});

export function WorkspaceProvider({ children }) {
  const [activeWorkspace, setActiveWorkspace] = useState(null);
  const [lastWorkspaceSlugState, setLastWorkspaceSlugState] = useState(() =>
    readStoredLastWorkspaceSlug()
  );
  const [lastOrganizationIdState, setLastOrganizationIdState] = useState(() =>
    readStoredLastOrganizationId()
  );
  const [singleOrgMode, setSingleOrgMode] = useState(() => readSingleOrgModeFlag());
  const [company, setCompany] = useState(() => readCompanySnapshot());

  const setLastWorkspaceSlug = useCallback((slug) => {
    const normalized = String(slug || '').trim();
    setLastWorkspaceSlugState(normalized);
    if (typeof window !== 'undefined') {
      if (normalized) window.localStorage.setItem(LAST_WORKSPACE_SLUG_KEY, normalized);
      else window.localStorage.removeItem(LAST_WORKSPACE_SLUG_KEY);
    }
  }, []);

  const setLastOrganizationId = useCallback((orgId) => {
    const normalized = String(orgId || '').trim();
    setLastOrganizationIdState(normalized);
    writeStoredLastOrganizationId(normalized);
  }, []);

  const setActiveWorkspaceWithPersist = useCallback(
    (workspace) => {
      const next = workspace || null;
      setActiveWorkspace((prev) => {
        const same =
          String(prev?._id || prev?.id || '') === String(next?._id || next?.id || '') &&
          String(prev?.slug || '') === String(next?.slug || '') &&
          String(prev?.name || '') === String(next?.name || '') &&
          String(prev?.myRole || '') === String(next?.myRole || '');
        if (!same && next) {
          const slug = String(next.slug || '').trim();
          const orgId = String(next._id || next.id || '').trim();
          queueMicrotask(() => {
            if (slug) setLastWorkspaceSlug(slug);
            if (orgId) setLastOrganizationId(orgId);
          });
        }
        return same ? prev : next;
      });
    },
    [setLastWorkspaceSlug, setLastOrganizationId]
  );

  const applyBootstrapCompany = useCallback(
    (bootstrap) => {
      const resolved = resolveCompanyFromBootstrap(bootstrap);
      const mode = Boolean(bootstrap?.singleOrgMode) || readSingleOrgModeFlag();
      setSingleOrgMode(mode);
      if (resolved) {
        setCompany(resolved);
        setActiveWorkspaceWithPersist(resolved);
      }
    },
    [setActiveWorkspaceWithPersist]
  );

  const getLastCommunicatePath = useCallback(() => {
    const orgId =
      String(activeWorkspace?._id || activeWorkspace?.id || lastOrganizationIdState || '').trim();
    return orgId ? `${buildCommunicateChannelsPath()}?organizationId=${encodeURIComponent(orgId)}` : buildCommunicateChannelsPath();
  }, [activeWorkspace, lastOrganizationIdState]);

  const getLastCollaboratePath = useCallback(() => {
    const orgId =
      String(activeWorkspace?._id || activeWorkspace?.id || lastOrganizationIdState || '').trim();
    return orgId ? buildCollaborateTasksPath(orgId) : '/app/collaborate/workspaces';
  }, [activeWorkspace, lastOrganizationIdState]);

  const getLastWorkspacePath = useCallback(() => getLastCollaboratePath(), [getLastCollaboratePath]);

  const value = useMemo(
    () => ({
      activeWorkspace,
      setActiveWorkspace: setActiveWorkspaceWithPersist,
      lastWorkspaceSlug: lastWorkspaceSlugState,
      lastOrganizationId: lastOrganizationIdState,
      singleOrgMode,
      company,
      applyBootstrapCompany,
      setLastWorkspaceSlug,
      setLastOrganizationId,
      getLastWorkspacePath,
      getLastCommunicatePath,
      getLastCollaboratePath,
    }),
    [
      activeWorkspace,
      lastWorkspaceSlugState,
      lastOrganizationIdState,
      singleOrgMode,
      company,
      applyBootstrapCompany,
      setLastWorkspaceSlug,
      setLastOrganizationId,
      getLastWorkspacePath,
      getLastCommunicatePath,
      getLastCollaboratePath,
    ]
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  return useContext(WorkspaceContext);
}

export { WorkspaceContext };
