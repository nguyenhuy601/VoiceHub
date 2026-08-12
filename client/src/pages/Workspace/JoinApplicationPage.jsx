import { Building2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  FIGMA_PAGE_CARD,
  FIGMA_PAGE_INNER,
  FIGMA_PAGE_SHELL,
  FIGMA_PAGE_SUBTITLE,
  FIGMA_PAGE_TITLE,
} from '../../components/Layout/figmaPageClasses';
import { useAppStrings } from '../../locales/appStrings';

/** Luồng đơn gia nhập đã bỏ — giữ route để bookmark cũ không 404. */
export default function JoinApplicationPage() {
  const { t } = useAppStrings();
  const { orgId } = useParams();
  const navigate = useNavigate();
  const shell = `flex h-full ${FIGMA_PAGE_SHELL} text-foreground`;

  return (
    <div className={shell}>
      <div className={`mx-auto flex w-full max-w-lg flex-col justify-center ${FIGMA_PAGE_INNER}`}>
        <div className={`${FIGMA_PAGE_CARD} p-8 text-center`}>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
            <Building2 className="h-6 w-6 text-muted-foreground" />
          </div>
          <h1 className={FIGMA_PAGE_TITLE}>{t('joinApplication.removedTitle')}</h1>
          <p className={`mt-2 ${FIGMA_PAGE_SUBTITLE}`}>
            {t('joinApplication.removedBody')}
          </p>
          <button
            type="button"
            className="mt-6 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            onClick={() => navigate('/app/collaborate/workspaces', { replace: true })}
          >
            {t('joinApplication.backToOrgs')}
          </button>
          {!orgId ? null : (
            <p className="mt-3 text-xs text-muted-foreground">{orgId}</p>
          )}
        </div>
      </div>
    </div>
  );
}
