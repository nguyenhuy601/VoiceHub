import { Link } from 'react-router-dom';
import { useAppStrings } from '../../locales/appStrings';
import { useCompanyHomeData } from './useCompanyHomeData';
import CompanyHomeOverview from './CompanyHomeOverview';
import { AdminListSkeleton } from '../../components/adminUsers/adminPanelStates';
import { useRouteDeniedNotice } from '../../config/routeDeniedNotice';
import {
  FIGMA_PAGE_INNER,
  FIGMA_PAGE_SHELL,
  FIGMA_PAGE_SUBTITLE,
  FIGMA_PAGE_TITLE,
} from '../../components/Layout/figmaPageClasses';
import { VH_MOTION_BTN } from '../../motion/classes';

/** Trang chủ phòng ban (hoặc team khi level=team) — Overview hub. */
export default function DepartmentHomePage() {
  const { t } = useAppStrings();
  const deniedMessage = useRouteDeniedNotice('admin');
  const {
    organizationId,
    departmentId,
    shellQuery,
    docsQuery,
    viewModel,
    paths,
    refetchAll,
  } = useCompanyHomeData();

  const isLoading = shellQuery.isLoading;
  const isError = shellQuery.isError;
  const deniedBanner = deniedMessage ? (
    <p className="mx-auto mb-4 max-w-3xl rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground" role="status">
      {deniedMessage}
    </p>
  ) : null;

  if (isLoading) {
    return (
      <div className={FIGMA_PAGE_SHELL}>
        {deniedBanner}
        <div className={FIGMA_PAGE_INNER}>
          <AdminListSkeleton rows={3} />
        </div>
      </div>
    );
  }

  if (!departmentId) {
    return (
      <div className={FIGMA_PAGE_SHELL}>
        {deniedBanner}
        <div className={FIGMA_PAGE_INNER}>
          <h1 className={FIGMA_PAGE_TITLE}>{t('nav.companyHome')}</h1>
          <p className={FIGMA_PAGE_SUBTITLE}>{t('nav.companyHomeNoDepartment')}</p>
          <Link
            to={paths.workspacesPath}
            className={`mt-3 inline-flex w-fit rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground no-underline hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${VH_MOTION_BTN}`}
          >
            {t('nav.companyWorkspaces')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      {deniedBanner}
      <CompanyHomeOverview
      viewModel={viewModel}
      organizationId={organizationId}
      departmentId={departmentId}
      paths={paths}
      onRetry={refetchAll}
      isError={isError}
      error={shellQuery.error || docsQuery.error}
    />
    </>
  );
}
