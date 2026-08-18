import { AlignLeft, CheckCircle2 } from 'lucide-react';
import {
  FIGMA_ORG_TASK_MODAL_INPUT,
  FIGMA_ORG_TASK_MODAL_PRIMARY_BTN,
} from '../../figmaOrganizationClasses';
import { useWorkItemDetail } from './WorkItemDetailContext';

export default function DescriptionTab() {
  const {
    workItem,
    isPlanning,
    t,
    description,
    setDescription,
    editingDescription,
    setEditingDescription,
    checklists,
    setChecklists,
    checklistDraft,
    setChecklistDraft,
    saving,
    save,
  } = useWorkItemDetail();

  if (isPlanning) {
    const text = String(workItem?.description || '').trim();
    return (
      <div className="px-1 py-1">
        <div className="mb-2 flex items-center gap-2">
          <AlignLeft className="h-4 w-4 opacity-70" aria-hidden />
          <h4 className="text-sm font-semibold">{t('workspace.projectHubWorkTabDescription')}</h4>
        </div>
        {text ? (
          <p className="whitespace-pre-wrap text-sm text-foreground">{text}</p>
        ) : (
          <p className="text-sm text-muted-foreground">{t('workspace.projectHubWorkNone')}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 px-1 py-1">
      <div>
        <div className="mb-2 flex items-center gap-2">
          <AlignLeft className="h-4 w-4 opacity-70" aria-hidden />
          <h4 className="text-sm font-semibold">{t('workspace.projectHubWorkTabDescription')}</h4>
          {!editingDescription ? (
            <button
              type="button"
              className="ml-auto text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setEditingDescription(true)}
            >
              {t('taskBoard.editDescription')}
            </button>
          ) : null}
        </div>
        {editingDescription ? (
          <div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={8}
              placeholder={t('taskBoard.descriptionPh')}
              className={`mb-2 w-full resize-none ${FIGMA_ORG_TASK_MODAL_INPUT}`}
              autoFocus
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={saving}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${FIGMA_ORG_TASK_MODAL_PRIMARY_BTN} w-auto`}
                onClick={async () => {
                  await save({ description });
                  setEditingDescription(false);
                }}
              >
                {t('common.save')}
              </button>
              <button
                type="button"
                className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground"
                onClick={() => {
                  setDescription(String(workItem?.description || ''));
                  setEditingDescription(false);
                }}
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        ) : description ? (
          <p className="whitespace-pre-wrap text-sm text-foreground">{description}</p>
        ) : (
          <button
            type="button"
            className="w-full rounded-lg border border-dashed border-border px-3 py-6 text-left text-sm text-muted-foreground hover:bg-muted"
            onClick={() => setEditingDescription(true)}
          >
            {t('taskBoard.descriptionPh')}
          </button>
        )}
      </div>

      <div>
        <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
          <CheckCircle2 className="h-4 w-4 opacity-70" aria-hidden />
          {t('taskBoard.checklist')}
        </h4>
        {(checklists[0]?.items || []).map((item, idx) => (
          <label
            key={`cl-${idx}`}
            className="mb-1 flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted"
          >
            <input
              type="checkbox"
              checked={Boolean(item.done)}
              disabled={saving}
              onChange={async () => {
                const next = checklists.length
                  ? JSON.parse(JSON.stringify(checklists))
                  : [{ title: 'Checklist', items: [] }];
                if (!next[0].items) next[0].items = [];
                next[0].items[idx] = { ...next[0].items[idx], done: !item.done };
                setChecklists(next);
                await save({ checklists: next });
              }}
            />
            <span className={item.done ? 'line-through opacity-60' : ''}>{item.text}</span>
          </label>
        ))}
        <div className="mt-2 flex gap-2">
          <input
            value={checklistDraft}
            onChange={(e) => setChecklistDraft(e.target.value)}
            placeholder={t('taskBoard.checklistAddPh')}
            className={`min-w-0 flex-1 ${FIGMA_ORG_TASK_MODAL_INPUT} py-1.5`}
            onKeyDown={async (e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              const text = checklistDraft.trim();
              if (!text) return;
              const next = checklists.length
                ? JSON.parse(JSON.stringify(checklists))
                : [{ title: 'Checklist', items: [] }];
              if (!next[0].items) next[0].items = [];
              next[0].items.push({ text, done: false });
              setChecklistDraft('');
              setChecklists(next);
              await save({ checklists: next });
            }}
          />
          <button
            type="button"
            className="rounded-lg bg-muted px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
            disabled={saving || !checklistDraft.trim()}
            onClick={async () => {
              const text = checklistDraft.trim();
              if (!text) return;
              const next = checklists.length
                ? JSON.parse(JSON.stringify(checklists))
                : [{ title: 'Checklist', items: [] }];
              if (!next[0].items) next[0].items = [];
              next[0].items.push({ text, done: false });
              setChecklistDraft('');
              setChecklists(next);
              await save({ checklists: next });
            }}
          >
            {t('workspace.projectHubWorkChildrenAdd')}
          </button>
        </div>
      </div>
    </div>
  );
}
