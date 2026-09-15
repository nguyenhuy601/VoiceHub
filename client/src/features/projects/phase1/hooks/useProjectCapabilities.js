import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchProjectHubProject } from '../../hub/useProjectHubQueries';
import { queryKeys } from '../../../../lib/queryKeys';

/**
 * Project hub capabilities for Phase 1 analysis / planning UI gates.
 */
export default function useProjectCapabilities(projectId) {
  const pid = String(projectId || '').trim();
  const { data: project, isLoading, error } = useQuery({
    queryKey: queryKeys.projectHub.project(pid),
    queryFn: () => fetchProjectHubProject(pid),
    enabled: Boolean(pid),
    staleTime: 30_000,
  });

  const caps = useMemo(() => {
    const c = project?.capabilities || {};
    return {
      canViewAnalysis: Boolean(c.canViewAnalysis),
      canEditAnalysis: Boolean(c.canEditAnalysis),
      canImportAnalysis: Boolean(c.canImportAnalysis),
      canReviewAnalysisBa: Boolean(c.canReviewAnalysisBa),
      canReviewAnalysisTech: Boolean(c.canReviewAnalysisTech),
      canReviewAnalysisPo: Boolean(c.canReviewAnalysisPo),
      canChangeDeliveryPhase: Boolean(c.canChangeDeliveryPhase),
      canCutSrs: Boolean(c.canCutSrs),
      canViewPlanning: Boolean(c.canViewPlanning),
      canEditPlanning: Boolean(c.canEditPlanning),
      canReviewPlanning: Boolean(c.canReviewPlanning),
      canCutPlanningBaseline: Boolean(c.canCutPlanningBaseline),
      canPublishPlanningWbs: Boolean(c.canPublishPlanningWbs),
      permissions: Array.isArray(c.permissions) ? c.permissions : [],
    };
  }, [project]);

  return { project, capabilities: caps, isLoading, error };
}
