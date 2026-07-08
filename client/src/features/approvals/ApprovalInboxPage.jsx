import { Link } from 'react-router-dom';
import { Bot, ClipboardList } from 'lucide-react';
import { FIGMA_PAGE_SHELL } from '../../components/Layout/figmaPageClasses';
import { useAppStrings } from '../../locales/appStrings';
import useUiRole from '../../hooks/useUiRole';

export default function ApprovalInboxPage() {
  const { t } = useAppStrings();
  const { isManagerOrAbove } = useUiRole();

  if (!isManagerOrAbove) {
    return (
      <div className={`flex h-[100dvh] flex-col items-center justify-center gap-3 p-6 text-center ${FIGMA_PAGE_SHELL}`}>
        <p className="text-muted-foreground">{t('approvals.noAccess')}</p>
        <Link to="/app/collaborate/workspaces" className="text-sm text-primary hover:underline">
          {t('companyAdmin.backToWork')}
        </Link>
      </div>
    );
  }

  return (
    <div className={`flex h-[100dvh] flex-col overflow-hidden ${FIGMA_PAGE_SHELL} text-foreground`}>
      <header className="shrink-0 border-b border-border px-4 py-4 md:px-8">
        <h1 className="text-xl font-bold">{t('approvals.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('approvals.subtitle')}</p>
      </header>
      <main className="flex-1 overflow-auto p-4 md:p-8">
        <div className="mx-auto max-w-2xl space-y-6">
          <section className="rounded-xl border border-border bg-card p-5">
            <div className="mb-3 flex items-center gap-2 text-primary">
              <Bot size={20} />
              <h2 className="font-semibold">{t('approvals.aiDraftsTitle')}</h2>
            </div>
            <p className="text-sm text-muted-foreground">{t('approvals.aiDraftsHint')}</p>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              <li>• {t('approvals.aiDraftsStep1')}</li>
              <li>• {t('approvals.aiDraftsStep2')}</li>
              <li>• {t('approvals.aiDraftsStep3')}</li>
            </ul>
          </section>
          <section className="rounded-xl border border-dashed border-border p-5 text-center">
            <ClipboardList className="mx-auto mb-2 text-muted-foreground" size={28} />
            <p className="text-sm text-muted-foreground">{t('approvals.emptyInbox')}</p>
            <Link
              to="/app/collaborate/tasks"
              className="mt-3 inline-block text-sm text-primary hover:underline"
            >
              {t('approvals.openProjects')}
            </Link>
          </section>
        </div>
      </main>
    </div>
  );
}
