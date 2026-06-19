import { Copy, Plus, Trash2 } from 'lucide-react';
import { hasBackendCapability } from '../../config/backendCapabilities';
import {
  FIGMA_SETTINGS_API_KEY_CARD,
  FIGMA_SETTINGS_SECTION_DESC,
  FIGMA_SETTINGS_SECTION_TITLE,
} from './figmaSettingsClasses';
import { useAppStrings } from '../../locales/appStrings';

const API_KEYS_ENABLED = hasBackendCapability('apiKeys');

export default function SettingsApiKeysPanel({
  apiKeys = [],
  onCreate,
  onCopy,
  onDelete,
  title,
  description,
  createLabel,
}) {
  const { t } = useAppStrings();
  const resolvedTitle = title ?? t('settingsPage.apiKeysTitle');
  const resolvedDescription = description ?? t('settingsPage.apiKeysDesc');
  const resolvedCreateLabel = createLabel ?? t('settingsPage.createApiKey');

  if (!API_KEYS_ENABLED) {
    return (
      <div className="max-w-xl space-y-3">
        <h2 className={FIGMA_SETTINGS_SECTION_TITLE}>{resolvedTitle}</h2>
        <p className={FIGMA_SETTINGS_SECTION_DESC}>{resolvedDescription}</p>
        <div className="rounded-xl border border-dashed border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          {t('settingsPage.apiKeysBackendNote')}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className={`${FIGMA_SETTINGS_SECTION_TITLE} flex flex-wrap items-center gap-2`}>
            {resolvedTitle}
          </h2>
          <p className={FIGMA_SETTINGS_SECTION_DESC}>{resolvedDescription}</p>
        </div>
        {onCreate && (
          <button
            type="button"
            onClick={onCreate}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border-none bg-primary px-4 text-xs font-semibold text-primary-foreground"
          >
            <Plus size={14} />
            {resolvedCreateLabel}
          </button>
        )}
      </div>

      <div className="space-y-3">
        {apiKeys.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('settingsPage.apiKeysEmpty')}</p>
        ) : (
          apiKeys.map((k) => (
            <div key={k.id} className={FIGMA_SETTINGS_API_KEY_CARD}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 font-medium text-foreground">{k.name}</div>
                  <div className="flex items-center gap-2">
                    <code className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {k.value || k.key}
                    </code>
                    {onCopy && (
                      <button
                        type="button"
                        onClick={() => onCopy(k.value || k.key)}
                        className="border-none bg-transparent p-0 text-muted-foreground transition hover:text-primary"
                        aria-label={t('settingsPage.copyAria')}
                      >
                        <Copy size={13} />
                      </button>
                    )}
                  </div>
                  <div className="mt-1.5 text-xs text-muted-foreground">
                    {k.created && t('settingsPage.apiKeyCreatedPrefix', { date: k.created })}
                    {k.lastUsed && ` · ${t('settingsPage.apiKeyLastUsedPrefix', { date: k.lastUsed })}`}
                    {k.scope && ` · ${t('settingsPage.apiKeyScopePrefix', { scope: k.scope })}`}
                  </div>
                </div>
                {onDelete && (
                  <button
                    type="button"
                    onClick={() => onDelete(k.id)}
                    className="shrink-0 border-none bg-transparent text-muted-foreground transition hover:text-error"
                    aria-label={t('settingsPage.deleteAria')}
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
