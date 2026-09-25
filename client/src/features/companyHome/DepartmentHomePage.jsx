import { Link } from 'react-router-dom';
import { useAppStrings } from '../../locales/appStrings';
import { useCompanyHomeData } from './useCompanyHomeData';
import CompanyHomeOverview from './CompanyHomeOverview';
import {
  FIGMA_PAGE_INNER,
  FIGMA_PAGE_SHELL,
  FIGMA_PAGE_SUBTITLE,
  FIGMA_PAGE_TITLE,
} from '../../components/Layout/figmaPageClasses';

/** Trang chủ phòng ban (hoặc team khi level=team) — Overview hub. */
export default function DepartmentHomePage() {
  const { t } = useAppStrings();
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

  if (isLoading) {
    return (
      <div className={FIGMA_PAGE_SHELL}>
        <div className={FIGMA_PAGE_INNER}>
          <p className={FIGMA_PAGE_SUBTITLE}>{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  if (!departmentId) {
    return (
      <div className={FIGMA_PAGE_SHELL}>
        <div className={FIGMA_PAGE_INNER}>
          <h1 className={FIGMA_PAGE_TITLE}>{t('nav.companyHome')}</h1>
          <p className={FIGMA_PAGE_SUBTITLE}>{t('nav.companyHomeNoDepartment')}</p>
          <Link
            to={paths.workspacesPath}
            className="mt-3 inline-flex w-fit rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground no-underline"
          >
            {t('nav.companyWorkspaces')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <CompanyHomeOverview
      viewModel={viewModel}
      organizationId={organizationId}
      departmentId={departmentId}
      paths={paths}
      onRetry={refetchAll}
      isError={isError}
      error={shellQuery.error || docsQuery.error}
    />
  );
}
