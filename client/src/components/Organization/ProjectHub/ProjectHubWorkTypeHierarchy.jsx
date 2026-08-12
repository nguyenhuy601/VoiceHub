import { useMemo, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronRight, Eye, EyeOff, GripVertical } from 'lucide-react';
import ProjectHubIssueTypeBadge from './ProjectHubIssueTypeBadge';
import {
  WORK_TYPE_INDENT_PX,
  WORK_TYPE_MAX_DEPTH,
  applyWorkTypeDrag,
  depthDeltaFromPointerX,
  peerWorkTypeIds,
  toggleWorkTypeHidden,
  visibleWorkTypeIds,
  workTypeHasChildren,
} from './projectWorkTypes';
import { useProjectWorkTypes } from './useProjectWorkTypes';

const META = {
  epic: {
    badgeType: 'epic',
    titleKey: 'workspace.projectHubWorkTypeEpic',
    hintKey: 'workspace.projectHubWorkTypeEpicHint',
  },
  feature: {
    badgeType: 'feature',
    titleKey: 'workspace.projectHubWorkTypeFeature',
    hintKey: 'workspace.projectHubWorkTypeFeatureHint',
  },
  story: {
    badgeType: 'story',
    titleKey: 'workspace.projectHubWorkTypeStory',
    hintKey: 'workspace.projectHubWorkTypeStoryHint',
  },
  task: {
    badgeType: 'task',
    titleKey: 'workspace.projectHubWorkTypeTask',
    hintKey: 'workspace.projectHubWorkTypeTaskHint',
  },
  bug: {
    badgeType: 'bug',
    titleKey: 'workspace.projectHubWorkTypeBug',
    hintKey: 'workspace.projectHubWorkTypeBugHint',
  },
  subtask: {
    badgeType: 'subtask',
    titleKey: 'workspace.projectHubWorkTypeSubtask',
    hintKey: 'workspace.projectHubWorkTypeSubtaskHint',
  },
};

function typeName(t, id) {
  const meta = META[id];
  return meta ? t(meta.titleKey) : id;
}

function SortableTypeRow({
  id,
  depth,
  hasChildren,
  collapsed,
  isHidden,
  peerIds,
  t,
  onToggleCollapse,
  onToggleHidden,
}) {
  const meta = META[id];
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  if (!meta) return null;
  const open = !collapsed;
  const name = t(meta.titleKey);
  const peerNames = peerIds.map((pid) => typeName(t, pid)).filter(Boolean);
  // Bỏ translateX của sortable — thụt ngang chỉ theo bậc (paddingLeft).
  const style = {
    transform: CSS.Transform.toString(transform ? { ...transform, x: 0 } : null),
    transition,
    opacity: isDragging ? 0.45 : undefined,
    paddingLeft: 8 + depth * WORK_TYPE_INDENT_PX,
  };

  return (
    <li ref={setNodeRef} style={style} className={`border-b border-border last:border-b-0 ${isHidden ? 'opacity-55' : ''}`}>
      <div className="flex flex-wrap items-center gap-2 px-2 py-2.5">
        {hasChildren ? (
          <button
            type="button"
            className="rounded p-0.5 text-muted-foreground hover:text-foreground"
            aria-label={
              open ? t('workspace.projectHubWorkTypeCollapseAria') : t('workspace.projectHubWorkTypeExpandAria')
            }
            onClick={onToggleCollapse}
          >
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <span className="w-4" aria-hidden />
        )}
        <button
          type="button"
          className="cursor-grab touch-none rounded p-0.5 text-muted-foreground hover:text-foreground active:cursor-grabbing"
          aria-label={t('workspace.projectHubWorkTypeDragAria')}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={14} aria-hidden />
        </button>
        <ProjectHubIssueTypeBadge type={meta.badgeType} variant="icon" label={name} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-foreground">{name}</p>
          <p className="text-[11px] leading-snug text-muted-foreground">{t(meta.hintKey)}</p>
          <p className="text-[11px] leading-snug text-muted-foreground">
            {peerNames.length
              ? t('workspace.projectHubWorkTypePeersWith', { names: peerNames.join(', ') })
              : t('workspace.projectHubWorkTypePeersAlone')}
          </p>
        </div>
        {isHidden ? (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t('workspace.projectHubWorkTypeHiddenBadge')}
          </span>
        ) : null}
        <button
          type="button"
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={
            isHidden
              ? t('workspace.projectHubWorkTypeShowAria', { name })
              : t('workspace.projectHubWorkTypeHideAria', { name })
          }
          onClick={onToggleHidden}
        >
          {isHidden ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />}
        </button>
      </div>
    </li>
  );
}

/**
 * Cây loại việc — kéo dọc đổi thứ tự, kéo ngang đổi cấp (cùng thụt = cùng cấp).
 */
export default function ProjectHubWorkTypeHierarchy({ t, projectId = '', serverConfig = null }) {
  const { config, updateConfig } = useProjectWorkTypes(projectId, { serverConfig });
  const [collapsed, setCollapsed] = useState({});
  const [dragPreview, setDragPreview] = useState(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const visibleIds = useMemo(
    () => visibleWorkTypeIds(config.treeOrder, config.depthById, collapsed),
    [config.treeOrder, config.depthById, collapsed]
  );

  const toggleCollapse = (id) => setCollapsed((c) => ({ ...c, [id]: !c[id] }));

  const clearDrag = () => setDragPreview(null);

  const onDragStart = (event) => {
    setDragPreview({ id: String(event.active?.id || ''), deltaX: 0 });
  };

  const onDragMove = (event) => {
    const id = String(event.active?.id || '');
    if (!id) return;
    setDragPreview({ id, deltaX: Number(event.delta?.x) || 0 });
  };

  const onDragEnd = (event) => {
    const activeId = String(event.active?.id || '');
    clearDrag();
    if (!activeId) return;
    updateConfig((prev) =>
      applyWorkTypeDrag(prev, {
        activeId,
        overId: event.over?.id,
        deltaX: event.delta?.x,
      })
    );
  };

  return (
    <div>
      <p className="mb-1 text-xs text-muted-foreground">{t('workspace.projectHubSettingsWorkTypesHint')}</p>
      <p className="mb-3 text-xs text-muted-foreground">{t('workspace.projectHubWorkTypeSameLevelHint')}</p>
      <p className="mb-3 text-[11px] text-muted-foreground">{t('workspace.projectHubWorkTypeLocalOnly')}</p>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
        onDragCancel={clearDrag}
      >
        <SortableContext items={visibleIds} strategy={verticalListSortingStrategy}>
          <ul className="rounded-xl border border-border bg-background">
            {visibleIds.map((id) => {
              const baseDepth = config.depthById[id] ?? 0;
              const dragging = dragPreview?.id === id;
              const previewDepth = dragging
                ? Math.max(
                    0,
                    Math.min(WORK_TYPE_MAX_DEPTH, baseDepth + depthDeltaFromPointerX(dragPreview.deltaX))
                  )
                : baseDepth;
              const peerIds = dragging
                ? config.treeOrder.filter(
                    (other) => other !== id && (config.depthById[other] ?? 0) === previewDepth
                  )
                : peerWorkTypeIds(config.treeOrder, config.depthById, id);
              return (
                <SortableTypeRow
                  key={id}
                  id={id}
                  depth={previewDepth}
                  hasChildren={workTypeHasChildren(config.treeOrder, config.depthById, id)}
                  collapsed={Boolean(collapsed[id])}
                  isHidden={Boolean(config.hidden[id])}
                  peerIds={peerIds}
                  t={t}
                  onToggleCollapse={() => toggleCollapse(id)}
                  onToggleHidden={() => updateConfig((prev) => toggleWorkTypeHidden(prev, id))}
                />
              );
            })}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}
