import { createContext, useContext, useMemo } from 'react';
import {
  SPACE_KIND,
  createSpaceContext,
  spaceHasProjectId,
  spaceRequiresProjectId,
} from '../utils/spaceContextUtils';

const SpaceContext = createContext({
  ...createSpaceContext(),
  setSpace: () => {},
});

/**
 * @param {{ kind?: string, organizationId?: string, departmentId?: string, teamId?: string, level?: string, projectId?: string, children: import('react').ReactNode }} props
 */
export function SpaceProvider({
  kind = SPACE_KIND.COMPANY,
  organizationId = '',
  departmentId = '',
  teamId = '',
  level = '',
  projectId = '',
  children,
}) {
  const value = useMemo(
    () =>
      createSpaceContext({
        kind,
        organizationId,
        departmentId,
        teamId,
        level,
        projectId,
      }),
    [kind, organizationId, departmentId, teamId, level, projectId]
  );

  return <SpaceContext.Provider value={value}>{children}</SpaceContext.Provider>;
}

export function useSpace() {
  return useContext(SpaceContext);
}

export function useSpaceOrThrow() {
  const space = useSpace();
  if (!space) {
    throw new Error('useSpaceOrThrow requires SpaceProvider');
  }
  return space;
}

export { SPACE_KIND, spaceHasProjectId, spaceRequiresProjectId, SpaceContext };
