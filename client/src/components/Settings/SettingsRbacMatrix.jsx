import { Check, Info, X } from 'lucide-react';
import {
  DEFAULT_RBAC_MATRIX,
  FIGMA_SETTINGS_MATRIX,
  FIGMA_SETTINGS_MATRIX_GROUP,
  FIGMA_SETTINGS_MATRIX_HEADER,
  FIGMA_SETTINGS_MATRIX_ROW,
  FIGMA_SETTINGS_SECTION_DESC,
  FIGMA_SETTINGS_SECTION_TITLE,
  getRbacPermissions,
  RBAC_ROLE_COLORS,
  RBAC_ROLES,
} from './figmaSettingsClasses';
import { hasBackendCapability } from '../../config/backendCapabilities';
import { useAppStrings } from '../../locales/appStrings';

function PermissionCell({ allowed }) {
  return (
    <div className="flex items-center justify-center">
      {allowed ? (
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-success/15 text-success">
          <Check size={14} strokeWidth={3} />
        </span>
      ) : (
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <X size={12} />
        </span>
      )}
    </div>
  );
}

export default function SettingsRbacMatrix({ matrix = DEFAULT_RBAC_MATRIX }) {
  const { t } = useAppStrings();
  const gridCols = '220px repeat(5, 1fr)';
  const permissionGroups = getRbacPermissions(t)
    .map((group) => ({
      ...group,
      items: group.items.filter((perm) => !perm.capability || hasBackendCapability(perm.capability)),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="max-w-[900px]">
      <div className="mb-5">
        <h2 className={FIGMA_SETTINGS_SECTION_TITLE}>{t('settingsPage.rbacMatrixTitle')}</h2>
        <p className={FIGMA_SETTINGS_SECTION_DESC}>{t('settingsPage.rbacMatrixDesc')}</p>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {RBAC_ROLES.map((role) => (
          <div
            key={role}
            className={`flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1 ${RBAC_ROLE_COLORS[role]}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full bg-current`} />
            <span className="text-[0.8125rem] font-semibold">{role}</span>
          </div>
        ))}
        <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          <Info size={13} />
          {t('settingsPage.rbacReadOnly')}
        </div>
      </div>

      <div className={FIGMA_SETTINGS_MATRIX}>
        <div
          className={FIGMA_SETTINGS_MATRIX_HEADER}
          style={{ gridTemplateColumns: gridCols, display: 'grid' }}
        >
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {t('settingsPage.rbacPermCol')}
          </div>
          {RBAC_ROLES.map((role) => (
            <div key={role} className="text-center">
              <span
                className={`inline-flex items-center gap-1 rounded-md bg-muted px-2.5 py-0.5 text-xs font-bold ${RBAC_ROLE_COLORS[role]}`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {role}
              </span>
            </div>
          ))}
        </div>

        {permissionGroups.map((group) => (
          <div key={group.group}>
            <div className={FIGMA_SETTINGS_MATRIX_GROUP}>
              <span className="text-[0.6875rem] font-bold uppercase tracking-wider text-primary">
                {group.group}
              </span>
            </div>
            {group.items.map((perm) => (
              <div
                key={perm.key}
                className={FIGMA_SETTINGS_MATRIX_ROW}
                style={{ gridTemplateColumns: gridCols, display: 'grid' }}
              >
                <div className="flex items-center text-[0.8125rem] text-foreground">
                  {perm.label}
                </div>
                {RBAC_ROLES.map((role) => (
                  <PermissionCell
                    key={role}
                    allowed={Boolean(matrix[perm.key]?.[role])}
                  />
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
