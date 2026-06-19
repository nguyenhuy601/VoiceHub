import { useMemo } from 'react';
import { Building2, ClipboardList, ShieldCheck } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  FIGMA_PAGE_CARD,
  FIGMA_PAGE_INNER,
  FIGMA_PAGE_SHELL,
  FIGMA_PAGE_SUBTITLE,
  FIGMA_PAGE_TITLE,
} from '../../components/Layout/figmaPageClasses';
import JoinApplicationForm from '../../components/Organization/JoinApplicationForm';
import { useAppStrings } from '../../locales/appStrings';

/**
 * Trang điền đơn gia nhập workspace (thay cho modal).
 * Đường dẫn: /app/collaborate/join/:orgId?name=Tên+TC
 */
export default function JoinApplicationPage() {
  const { t } = useAppStrings();
  const shell = `flex h-full ${FIGMA_PAGE_SHELL} text-foreground`;
  const { orgId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const organizationName = useMemo(() => {
    const raw = searchParams.get('name') || '';
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }, [searchParams]);

  const handleSubmitted = () => {
    toast.success(t('joinApplication.toastSent'));
    navigate('/app/collaborate/workspaces', { replace: true });
  };

  const handleCancel = () => {
    navigate('/app/collaborate/workspaces');
  };

  const backLinkCls =
    'text-sm text-primary-foreground/90 hover:text-primary-foreground hover:underline';
  const cardCls = `${FIGMA_PAGE_CARD} p-6 md:p-8`;

  if (!orgId) {
    return (
      <div className={shell}>
        <main className="flex flex-1 items-center justify-center p-6 text-muted-foreground">
          {t('joinApplication.missingOrgId')}
        </main>
      </div>
    );
  }

  return (
    <div className={shell}>
      <main className="flex flex-1 flex-col overflow-y-auto">
        <div className="relative overflow-hidden border-b border-border bg-gradient-to-br from-primary via-primary-hover to-info px-6 py-8 text-primary-foreground md:px-10">
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute bottom-0 left-1/3 h-32 w-32 rounded-full bg-info/20 blur-2xl" />
          <div className="relative mx-auto w-full max-w-4xl">
            <button type="button" onClick={handleCancel} className={backLinkCls}>
              {t('joinApplication.backToOrgs')}
            </button>
            <div className="mt-4 flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[13px] bg-white/15 shadow-lg backdrop-blur-sm">
                <Building2 size={22} className="text-white" />
              </div>
              <div>
                <h1 className="font-display text-2xl font-bold tracking-tight text-white md:text-3xl">
                  {t('joinApplication.title')}
                </h1>
                {organizationName ? (
                  <p className="mt-1 text-base font-semibold text-white/90">{organizationName}</p>
                ) : null}
                <p className="mt-2 max-w-xl text-sm text-white/75">{t('joinApplication.hint')}</p>
              </div>
            </div>
          </div>
        </div>

        <div className={`${FIGMA_PAGE_INNER} mx-auto w-full max-w-4xl flex-1`}>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-5 md:gap-8">
            <aside className="flex flex-col gap-4 md:col-span-2">
              <div className={`${FIGMA_PAGE_CARD} p-5`}>
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-[10px] bg-primary/10">
                  <ClipboardList size={18} className="text-primary" />
                </div>
                <h2 className="mb-1 text-sm font-semibold text-foreground">
                  {t('joinApplication.infoAccurateTitle')}
                </h2>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Quản trị viên sẽ xem xét đơn của bạn. Bạn nhận thông báo khi được phê duyệt hoặc từ chối.
                </p>
              </div>
              <div className={`${FIGMA_PAGE_CARD} p-5`}>
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-[10px] bg-success/10">
                  <ShieldCheck size={18} className="text-success" />
                </div>
                <h2 className="mb-1 text-sm font-semibold text-foreground">
                  {t('joinApplication.infoSecureTitle')}
                </h2>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Thông tin chỉ dùng để xét duyệt thành viên trong tổ chức, không chia sẻ ra bên ngoài.
                </p>
              </div>
            </aside>
            <div className={`md:col-span-3 ${cardCls}`}>
              <JoinApplicationForm
                orgId={orgId}
                organizationName={organizationName}
                onSubmitted={handleSubmitted}
                onCancel={handleCancel}
                showCancel
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
