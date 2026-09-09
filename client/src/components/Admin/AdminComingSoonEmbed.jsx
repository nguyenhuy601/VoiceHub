import { AdminUserFormCard } from '../adminUsers/adminUserPanelUi';
import { useAppStrings } from '../../locales/appStrings';

/** Nội dung tab chưa có màn thật — chỉ gom IA, không thêm API. */
export default function AdminComingSoonEmbed({ title, hint }) {
  const { t } = useAppStrings();
  return (
    <AdminUserFormCard title={title} hint={hint}>
      <p className="text-sm text-muted-foreground">{t('adminDomains.comingSoonHint')}</p>
    </AdminUserFormCard>
  );
}
