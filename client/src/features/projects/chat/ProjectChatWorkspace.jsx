import { useEffect, useMemo, useState } from 'react';
import { Hash, Lock } from 'lucide-react';
import { useTheme } from '../../../context/ThemeContext';
import { useAppStrings } from '../../../locales/appStrings';
import ProjectChatProjectsSidebar from '../../../components/Organization/ProjectChatProjectsSidebar';
import UnifiedChatComposer from '../../../components/Chat/UnifiedChatComposer';
import ChatContextPicker from '../../../components/Chat/ChatContextPicker';
import ChatContextPreview from '../../../components/Chat/ChatContextPreview';
import { normalizeMessageRefs, contextCallTargetFromMessage } from '../../../components/Chat/chatContextRefs';
import WorkItemDetail from '../hub/WorkItemDetail/WorkItemDetail';
import ProjectHubChangeRequestDetailDrawer from '../hub/ProjectHubChangeRequestDetailDrawer';
import { projectAPI } from '../../../services/api/projectAPI';
import { taskAPI, unwrapTaskApiPayload } from '../../../services/api/taskAPI';
import { projectChannelDisplayLabel } from '../../../utils/orgChannelScope';
import useProjectOrgChat from '../../../hooks/useProjectOrgChat';

function senderName(message, isMine, currentUser, fallback) {
  if (isMine) {
    return (
      currentUser?.displayName ||
      currentUser?.fullName ||
      currentUser?.username ||
      fallback
    );
  }
  const u = message?.senderId;
  if (u && typeof u === 'object') {
    return u.displayName || u.username || u.fullName || fallback;
  }
  return fallback;
}

function MessageRow({ message, isMine, currentUser, t, isDarkMode, onOpenRef }) {
  const refs = normalizeMessageRefs(message);
  const call = contextCallTargetFromMessage(message);
  const name = senderName(message, isMine, currentUser, t('orgPanel.member'));
  const chipCls = `mb-1 w-full rounded-lg border px-2 py-1.5 text-left text-xs ${
    isDarkMode ? 'border-indigo-400/25 bg-indigo-500/10' : 'border-indigo-200 bg-indigo-50'
  }`;
  return (
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
          isMine
            ? 'bg-primary text-primary-foreground'
            : isDarkMode
              ? 'bg-white/10 text-slate-100'
              : 'bg-muted text-foreground'
        }`}
      >
        {!isMine ? (
          <div className="mb-0.5 text-[10px] font-semibold opacity-80">{name}</div>
        ) : null}
        {call ? (
          <button type="button" className={chipCls} onClick={() => onOpenRef(call)}>
            {call.label || t('orgPanel.contextCallFallback')}
          </button>
        ) : null}
        {refs.map((ref) => (
          <button
            key={`${ref.kind}-${ref.id}`}
            type="button"
            className={chipCls}
            onClick={() => onOpenRef(ref)}
          >
            <span className="font-mono font-semibold">{ref.label || ref.id}</span>
          </button>
        ))}
        <div className="whitespace-pre-wrap break-words">{String(message?.content || '')}</div>
      </div>
    </div>
  );
}

/**
 * Workspace chat kênh Project — sidebar + tin + composer + context picker.
 */
export default function ProjectChatWorkspace({
  organizationId = '',
  projectIdFilter = '',
  channelId = '',
  onSelectChannel,
  emptyCta = null,
}) {
  const { t, locale } = useAppStrings();
  const { isDarkMode } = useTheme();
  const chat = useProjectOrgChat({
    organizationId,
    projectIdFilter,
    channelId,
  });
  const {
    orgId,
    currentUser,
    currentUserId,
    shellLoading,
    projectChannels,
    selectedChannel,
    selectedChannelId,
    canWrite,
    messages,
    loadingMessages,
    messageInput,
    setMessageInput,
    sending,
    sendMessage,
    channelPermissionMatrix,
  } = chat;

  const [contextPickerOpen, setContextPickerOpen] = useState(false);
  const [contextProjects, setContextProjects] = useState([]);
  const [contextProjectsLoading, setContextProjectsLoading] = useState(false);
  const [contextProject, setContextProject] = useState(null);
  const [contextRef, setContextRef] = useState(null);
  const [previewTarget, setPreviewTarget] = useState(null);
  const [workDetail, setWorkDetail] = useState(null);
  const [crDetail, setCrDetail] = useState(null);

  const apiCtx = useMemo(
    () => ({ organizationId: orgId, workspaceSlug: '' }),
    [orgId]
  );

  useEffect(() => {
    if (!contextPickerOpen || !orgId) return undefined;
    let cancelled = false;
    setContextProjectsLoading(true);
    projectAPI
      .list({ organizationId: orgId })
      .then((res) => {
        if (cancelled) return;
        const raw = res?.data?.projects ?? res?.projects ?? unwrapTaskApiPayload(res);
        const list = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
        setContextProjects(list);
      })
      .catch(() => {
        if (!cancelled) setContextProjects([]);
      })
      .finally(() => {
        if (!cancelled) setContextProjectsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [contextPickerOpen, orgId]);

  const chSlug = selectedChannel
    ? projectChannelDisplayLabel(selectedChannel, t)
    : '';
  const channelReadOnly = Boolean(selectedChannelId) && !canWrite;
  const hasContextCall = Boolean(contextProject || contextRef);

  const handleSend = () => {
    const ref = contextRef
      ? {
          kind: contextRef.kind,
          id: contextRef.id,
          projectId: contextRef.projectId,
          label: contextRef.label || contextRef.title || '',
        }
      : null;
    void sendMessage({
      contextProjectId: String(contextProject?.projectId || contextProject?._id || '').trim(),
      contextProjectName: String(contextProject?.name || contextProject?.title || '').trim(),
      contextRefs: ref ? [ref] : undefined,
      onSent: () => {
        setContextProject(null);
        setContextRef(null);
        setContextPickerOpen(false);
      },
    });
  };

  const openWorkFromPreview = (payload, target, panel) => {
    const kind = String(payload?.kind || target?.kind || '').trim();
    const projectId = String(payload?.projectId || target?.projectId || '').trim();
    const entityId = String(payload?.id || target?.id || '').trim();
    if (kind === 'change_request') {
      if (!projectId || !entityId) return;
      setPreviewTarget(null);
      setCrDetail({
        projectId,
        crId: entityId,
        initialTab: panel === 'activity' ? 'activity' : 'overview',
      });
      return;
    }
    if (kind !== 'task' || !entityId || payload?.restricted) return;
    setPreviewTarget(null);
    void (async () => {
      let workItem = {
        _id: entityId,
        title: payload?.title || target?.title || target?.label || '',
        issueType: payload?.issueType || 'task',
        status: payload?.status || '',
        priority: payload?.priority || '',
        projectId,
      };
      try {
        const res = await taskAPI.getTask(entityId, apiCtx);
        const data = unwrapTaskApiPayload(res);
        if (data && typeof data === 'object') workItem = data;
      } catch {
        /* stub from preview */
      }
      setWorkDetail({
        workItem,
        projectId,
        projectCode: payload?.project?.projectCode || '',
        boardId: String(workItem.boardId || '').trim(),
        initialPanel: panel === 'activity' ? 'activity' : 'detail',
      });
    })();
  };

  if (shellLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t('common.loading')}
      </div>
    );
  }

  if (!projectChannels.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <Hash className="text-muted-foreground" size={28} aria-hidden />
        <p className="text-sm text-muted-foreground">
          {projectIdFilter
            ? t('workspace.projectChatEmptyNoChannels')
            : t('workspace.projectChatEmptyNoProjects')}
        </p>
        {emptyCta}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-surface">
        <ProjectChatProjectsSidebar
          isDarkMode={isDarkMode}
          t={t}
          projectChannels={projectChannels}
          channelPermissionMatrix={channelPermissionMatrix}
          selectedChannelId={selectedChannelId}
          onSelectChannel={onSelectChannel}
          fillHeight
        />
      </aside>
      <section className="flex min-w-0 flex-1 flex-col">
        {selectedChannel ? (
          <>
            <header className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2.5">
              {String(selectedChannel.projectChannelKind) === 'announcement' ? (
                <Lock size={14} className="text-muted-foreground" aria-hidden />
              ) : (
                <Hash size={14} className="text-muted-foreground" aria-hidden />
              )}
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">
                  {selectedChannel.projectName
                    ? `${selectedChannel.projectName} · ${chSlug}`
                    : chSlug}
                </div>
              </div>
            </header>
            <div className="scrollbar-overlay min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3">
              {loadingMessages ? (
                <p className="text-center text-xs text-muted-foreground">{t('orgPanel.loadingMsgs')}</p>
              ) : null}
              {messages.map((message) => {
                const sid = String(
                  message?.senderId?._id || message?.senderId?.id || message?.senderId || ''
                );
                const isMine = Boolean(currentUserId && sid === currentUserId);
                return (
                  <MessageRow
                    key={String(message._id || message.id)}
                    message={message}
                    isMine={isMine}
                    currentUser={currentUser}
                    t={t}
                    isDarkMode={isDarkMode}
                    onOpenRef={setPreviewTarget}
                  />
                );
              })}
            </div>
            <div className="relative shrink-0 border-t border-border p-3">
              {hasContextCall ? (
                <div className="mb-2 flex items-center justify-between rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs dark:border-indigo-400/25 dark:bg-indigo-500/10">
                  <span className="truncate">
                    {contextRef?.label ||
                      contextRef?.title ||
                      contextProject?.name ||
                      contextProject?.title ||
                      ''}
                  </span>
                  <button
                    type="button"
                    className="shrink-0 rounded px-1"
                    onClick={() => {
                      setContextProject(null);
                      setContextRef(null);
                    }}
                  >
                    ×
                  </button>
                </div>
              ) : null}
              <ChatContextPicker
                open={contextPickerOpen}
                isDarkMode={isDarkMode}
                t={t}
                projects={contextProjects}
                loadingProjects={contextProjectsLoading}
                apiCtx={apiCtx}
                onSelectProject={(row) => {
                  setContextProject(row);
                  setContextRef(null);
                  setContextPickerOpen(false);
                }}
                onSelectRef={(item) => {
                  setContextRef(item);
                  setContextProject(null);
                  setContextPickerOpen(false);
                }}
              />
              <UnifiedChatComposer
                value={messageInput}
                onChange={setMessageInput}
                onSend={handleSend}
                disabled={!selectedChannelId || sending || channelReadOnly}
                sendDisabled={
                  !selectedChannelId ||
                  sending ||
                  channelReadOnly ||
                  (!String(messageInput || '').trim() && !hasContextCall)
                }
                placeholder={
                  channelReadOnly
                    ? t('orgPanel.composerReadOnlyHint')
                    : t('orgPanel.composerFigmaHint', { ch: chSlug || 'channel' })
                }
                wrapperClassName="p-0 border-0 bg-transparent"
                showSendButton
                leadingItems={[
                  {
                    key: 'context',
                    content: '🔗',
                    title: t('orgPanel.menuContextCall'),
                    onClick: () => setContextPickerOpen((open) => !open),
                    disabled: channelReadOnly,
                  },
                ]}
              />
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center px-6 text-sm text-muted-foreground">
            {t('workspace.projectChatSelectChannel')}
          </div>
        )}
      </section>
      <ChatContextPreview
        target={previewTarget}
        t={t}
        onClose={() => setPreviewTarget(null)}
        onOpenWork={(payload, target) => openWorkFromPreview(payload, target, 'detail')}
        onOpenDiscussion={(payload, target) => openWorkFromPreview(payload, target, 'activity')}
      />
      {workDetail?.workItem ? (
        <WorkItemDetail
          open
          chrome="modal"
          workItem={workDetail.workItem}
          projectId={workDetail.projectId}
          projectCode={workDetail.projectCode}
          boardId={workDetail.boardId}
          apiCtx={apiCtx}
          isDarkMode={isDarkMode}
          locale={locale}
          initialPanel={workDetail.initialPanel || 'detail'}
          onClose={() => setWorkDetail(null)}
        />
      ) : null}
      <ProjectHubChangeRequestDetailDrawer
        open={Boolean(crDetail?.crId)}
        projectId={crDetail?.projectId || ''}
        crId={crDetail?.crId || ''}
        locale={locale}
        initialTab={crDetail?.initialTab || 'overview'}
        onClose={() => setCrDetail(null)}
      />
    </div>
  );
}
