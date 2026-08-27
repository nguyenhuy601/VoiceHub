import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Hash, Image as ImageIcon, Lock, Paperclip, Smile, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTheme } from '../../../context/ThemeContext';
import { useAppStrings } from '../../../locales/appStrings';
import ProjectChatProjectsSidebar from '../../../components/Organization/ProjectChatProjectsSidebar';
import UnifiedChatComposer from '../../../components/Chat/UnifiedChatComposer';
import ComposerEmojiPicker from '../../../components/Chat/ComposerEmojiPicker';
import ComposerAttachmentDraft from '../../../components/Chat/ComposerAttachmentDraft';
import ChatUploadProgressBar from '../../../components/Chat/ChatUploadProgressBar';
import ChatContextPicker from '../../../components/Chat/ChatContextPicker';
import ChatContextPreview from '../../../components/Chat/ChatContextPreview';
import ForwardChannelModal from '../../../components/Organization/ForwardChannelModal';
import { Modal } from '../../../components/Shared';
import ProjectChannelMessageRow from './ProjectChannelMessageRow';
import WorkItemDetail from '../hub/WorkItemDetail/WorkItemDetail';
import { hydrateWorkItemDetailFromHub } from '../hub/WorkItemDetail/hydrateWorkItemDetailFromHub';
import ProjectHubChangeRequestDetailDrawer from '../hub/ProjectHubChangeRequestDetailDrawer';
import { projectAPI } from '../../../services/api/projectAPI';
import { taskAPI, unwrapTaskApiPayload } from '../../../services/api/taskAPI';
import { projectChannelDisplayLabel } from '../../../utils/orgChannelScope';
import { plainTextForMessage } from '../../../utils/orgChatMessageUtils';
import { normalizeComposerFile } from '../../../utils/composerAttachmentUtils';
import { fetchChatMediaFile } from '../../../utils/chatGifStickerSend';
import { resolveApiErrorMessage } from '../../../utils/resolveApiErrorMessage';
import useProjectOrgChat from '../../../hooks/useProjectOrgChat';

/**
 * Workspace chat kênh Project — sidebar + tin + composer + context picker.
 */
export default function ProjectChatWorkspace({
  organizationId = '',
  projectIdFilter = '',
  channelId = '',
  onSelectChannel,
  emptyCta = null,
  canViewMembers = false,
}) {
  const { t, locale } = useAppStrings();
  const { isDarkMode } = useTheme();
  const chat = useProjectOrgChat({
    organizationId,
    projectIdFilter,
    channelId,
    onSelectChannel,
  });
  const {
    orgId,
    currentUser,
    currentUserId,
    shellLoading,
    shellError,
    refetchShell,
    projectChannels,
    selectedChannel,
    selectedChannelId,
    canWrite,
    messages,
    loadingMessages,
    messagesError,
    refetchMessages,
    hasMoreOlder,
    loadingOlder,
    loadOlderMessages,
    messageInput,
    setMessageInput,
    sending,
    sendMessage,
    sendFileMessage,
    channelPermissionMatrix,
    replyToMessage,
    setReplyToMessage,
    editingMessageId,
    editDraft,
    setEditDraft,
    savingEdit,
    beginEditMessage,
    cancelEditMessage,
    submitEditMessage,
    toggleReaction,
    deleteMessage,
    recallMessage,
    forwardMessage,
  } = chat;

  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [composerAttachment, setComposerAttachment] = useState(null);
  const [mediaPickerSending, setMediaPickerSending] = useState(false);

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiPickerTab, setEmojiPickerTab] = useState('emoji');
  const [emojiSearch, setEmojiSearch] = useState('');

  const [contextPickerOpen, setContextPickerOpen] = useState(false);
  const [contextProjects, setContextProjects] = useState([]);
  const [contextProjectsLoading, setContextProjectsLoading] = useState(false);
  const [contextProject, setContextProject] = useState(null);
  const [contextRef, setContextRef] = useState(null);
  const [previewTarget, setPreviewTarget] = useState(null);
  const [workDetail, setWorkDetail] = useState(null);
  const [crDetail, setCrDetail] = useState(null);

  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [forwardModalOpen, setForwardModalOpen] = useState(false);
  const [forwardSourceMessage, setForwardSourceMessage] = useState(null);

  const apiCtx = useMemo(
    () => ({ organizationId: orgId, workspaceSlug: '' }),
    [orgId]
  );

  const isAnnouncement =
    String(selectedChannel?.projectChannelKind || '') === 'announcement';
  const isCrossTeam =
    String(selectedChannel?.projectChannelKind || '') === 'cross_team';
  const isGeneral =
    String(selectedChannel?.projectChannelKind || '') === 'general';

  useEffect(() => {
    if (!contextPickerOpen || !orgId || isAnnouncement) return undefined;
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
  }, [contextPickerOpen, orgId, isAnnouncement]);

  const chSlug = selectedChannel
    ? projectChannelDisplayLabel(selectedChannel, t)
    : '';
  const channelReadOnly = Boolean(selectedChannelId) && (!canWrite || isAnnouncement);
  const hasComposerAttachment = Boolean(composerAttachment?.file);
  const composerDisabled =
    !selectedChannelId || sending || uploadProgress != null || channelReadOnly;
  const hasContextCall = Boolean(contextProject || contextRef);

  const clearComposerAttachment = useCallback(() => {
    setComposerAttachment((prev) => {
      if (prev?.objectUrl) URL.revokeObjectURL(prev.objectUrl);
      return null;
    });
  }, []);

  useEffect(() => {
    clearComposerAttachment();
    setShowEmojiPicker(false);
    setEmojiSearch('');
    setEmojiPickerTab('emoji');
  }, [selectedChannelId, clearComposerAttachment]);

  useEffect(() => () => clearComposerAttachment(), [clearComposerAttachment]);

  const queueComposerAttachment = useCallback(
    (file) => {
      if (!file || channelReadOnly) return;
      clearComposerAttachment();
      const normalized = normalizeComposerFile(file, t);
      const isImage = (normalized.type || '').startsWith('image/');
      setComposerAttachment({
        file: normalized,
        objectUrl: isImage ? URL.createObjectURL(normalized) : null,
        isImage,
      });
    },
    [channelReadOnly, clearComposerAttachment, t]
  );

  const forwardTargets = useMemo(
    () => [
      {
        departmentId: 'projects',
        departmentName: t('workspace.projectChatForwardGroup'),
        channels: projectChannels
          .filter((ch) => String(ch._id) !== String(selectedChannelId))
          .map((ch) => ({
            _id: ch._id,
            name: ch.projectName
              ? `${ch.projectName} · ${projectChannelDisplayLabel(ch, t)}`
              : projectChannelDisplayLabel(ch, t),
            type: 'chat',
          })),
      },
    ],
    [projectChannels, selectedChannelId, t]
  );

  const forwardPreviewText = forwardSourceMessage
    ? plainTextForMessage(forwardSourceMessage, t('orgPanel.attachment'))
    : '';

  const appendEmoji = (emoji) => {
    setMessageInput((prev) => `${prev || ''}${emoji}`);
    setShowEmojiPicker(false);
  };

  const handlePickChatMedia = useCallback(
    async (item) => {
      if (!item?.url || !selectedChannelId || channelReadOnly || sending) return false;
      setMediaPickerSending(true);
      setUploadProgress(0);
      try {
        const rawFile = await fetchChatMediaFile(item);
        const file = normalizeComposerFile(rawFile, t);
        const ok = await sendFileMessage(file, { onProgress: setUploadProgress });
        if (ok) setShowEmojiPicker(false);
        return ok;
      } catch (error) {
        toast.error(
          resolveApiErrorMessage(error, { t, fallback: t('organizations.sendMessageFail') })
        );
        return false;
      } finally {
        setUploadProgress(null);
        setMediaPickerSending(false);
      }
    },
    [selectedChannelId, channelReadOnly, sending, sendFileMessage, t]
  );

  const handleFileSelected = (file) => {
    if (!file || composerDisabled) return;
    queueComposerAttachment(file);
  };

  const handleSend = async () => {
    if (isAnnouncement || !canWrite) return;

    if (hasComposerAttachment) {
      const file = composerAttachment.file;
      setUploadProgress(0);
      try {
        const ok = await sendFileMessage(file, {
          caption: messageInput,
          onProgress: setUploadProgress,
        });
        if (ok) {
          clearComposerAttachment();
          setMessageInput('');
          setContextProject(null);
          setContextRef(null);
          setContextPickerOpen(false);
        }
      } finally {
        setUploadProgress(null);
      }
      return;
    }

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
      try {
        const hydrated = await hydrateWorkItemDetailFromHub({
          entityId,
          projectId,
          boardId: String(payload?.boardId || target?.boardId || '').trim(),
          stub: {
            title: payload?.title || target?.title || target?.label || '',
            issueType: payload?.issueType || 'task',
            status: payload?.status || '',
            priority: payload?.priority || '',
            project: payload?.project,
          },
          apiCtx,
        });
        setWorkDetail({
          ...hydrated,
          initialPanel: panel === 'activity' ? 'activity' : 'detail',
        });
      } catch (err) {
        toast.error(
          resolveApiErrorMessage(err, { t, fallback: t('taskBoard.loadBoardFail') })
        );
      }
    })();
  };

  if (shellLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t('common.loading')}
      </div>
    );
  }

  if (shellError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted-foreground">{t('organizations.loadFail')}</p>
        <button
          type="button"
          className="rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted"
          onClick={() => void refetchShell()}
        >
          {t('common.refresh')}
        </button>
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
      <section className="relative flex min-h-0 min-w-0 flex-1 flex-col">
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
              {hasMoreOlder && loadOlderMessages ? (
                <div className="flex justify-center pb-1">
                  <button
                    type="button"
                    disabled={loadingOlder}
                    onClick={() => void loadOlderMessages()}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      isDarkMode
                        ? 'border border-white/10 bg-white/5 text-gray-300 hover:bg-white/10 disabled:opacity-50'
                        : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50'
                    }`}
                  >
                    {loadingOlder ? t('friendChat.loadingOlder') : t('friendChat.loadOlder')}
                  </button>
                </div>
              ) : null}
              {loadingMessages ? (
                <p className="text-center text-xs text-muted-foreground">{t('orgPanel.loadingMsgs')}</p>
              ) : null}
              {messagesError && !loadingMessages ? (
                <div className="flex flex-col items-center gap-2 py-4 text-center">
                  <p className="text-xs text-muted-foreground">{t('organizations.loadMessagesFail')}</p>
                  <button
                    type="button"
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted"
                    onClick={() => void refetchMessages()}
                  >
                    {t('common.refresh')}
                  </button>
                </div>
              ) : null}
              {!loadingMessages && !messagesError && messages.length === 0 ? (
                <div className="flex min-h-[12rem] flex-col items-center justify-center px-4 py-8 text-center">
                  {isAnnouncement ? (
                    <>
                      <p className="text-sm font-semibold text-foreground">
                        {t('orgPanel.announcementEmptyTitle')}
                      </p>
                      <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                        {t('orgPanel.announcementEmptyHint')}
                      </p>
                    </>
                  ) : isCrossTeam ? (
                    <>
                      <p className="text-sm font-semibold text-foreground">
                        {t('workspace.projectChatCrossTeamEmptyTitle')}
                      </p>
                      <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                        {t('workspace.projectChatCrossTeamEmptyHint')}
                      </p>
                    </>
                  ) : isGeneral ? (
                    <>
                      <p className="text-sm font-semibold text-foreground">
                        {t('workspace.projectChatGeneralEmptyTitle')}
                      </p>
                      <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                        {t('workspace.projectChatGeneralEmptyHint')}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {t('orgPanel.composerFigmaHint', { ch: chSlug || 'channel' })}
                    </p>
                  )}
                </div>
              ) : null}
              {messages.map((message) => (
                <ProjectChannelMessageRow
                  key={String(message._id || message.id)}
                  message={message}
                  messages={messages}
                  currentUser={currentUser}
                  currentUserId={currentUserId}
                  isDarkMode={isDarkMode}
                  t={t}
                  sending={sending}
                  editingMessageId={editingMessageId}
                  editDraft={editDraft}
                  savingEdit={savingEdit}
                  onOpenRef={setPreviewTarget}
                  onQuickReact={toggleReaction}
                  onReply={(msg) => setReplyToMessage(msg)}
                  onForward={(msg) => {
                    setForwardSourceMessage(msg);
                    setForwardModalOpen(true);
                  }}
                  onBeginEdit={beginEditMessage}
                  onEditDraftChange={setEditDraft}
                  onSubmitEdit={submitEditMessage}
                  onCancelEdit={cancelEditMessage}
                  onDelete={(mid) => setDeleteConfirmId(mid)}
                  onRecall={recallMessage}
                />
              ))}
            </div>
            <div className="relative z-10 shrink-0 border-t border-border bg-surface p-3">
              {isAnnouncement ? (
                <p className="text-center text-xs text-muted-foreground">
                  {t('orgPanel.announcementComposerHint')}
                </p>
              ) : (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (file) handleFileSelected(file);
                    }}
                  />
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (file) handleFileSelected(file);
                    }}
                  />
                  {replyToMessage ? (
                    <div className="mb-2 flex items-center justify-between rounded-lg border border-border bg-muted/40 px-2 py-1.5 text-xs">
                      <span className="min-w-0 truncate">
                        {t('orgPanel.replying')}
                        {plainTextForMessage(replyToMessage, t('orgPanel.attachment')).slice(0, 80)}
                      </span>
                      <button
                        type="button"
                        className="ml-2 shrink-0 rounded p-0.5 hover:bg-muted"
                        aria-label={t('nav.close')}
                        onClick={() => setReplyToMessage(null)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : null}
                  <ChatUploadProgressBar
                    percent={uploadProgress}
                    label={t('friendChat.uploadLabel')}
                  />
                  <ComposerAttachmentDraft
                    file={composerAttachment?.file}
                    previewUrl={composerAttachment?.objectUrl}
                    isDarkMode={isDarkMode}
                    disabled={composerDisabled}
                    onRemove={clearComposerAttachment}
                  />
                  {isCrossTeam && !hasContextCall ? (
                    <p className="mb-2 text-xs text-muted-foreground">
                      {t('workspace.projectChatCrossTeamContextHint')}
                    </p>
                  ) : null}
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
                    onPaste={(e) => {
                      const file = e.clipboardData?.files?.[0];
                      if (!file || composerDisabled) return;
                      e.preventDefault();
                      queueComposerAttachment(file);
                    }}
                    disabled={composerDisabled}
                    sendDisabled={
                      composerDisabled ||
                      (!String(messageInput || '').trim() &&
                        !hasContextCall &&
                        !hasComposerAttachment)
                    }
                    placeholder={
                      uploadProgress != null
                        ? t('taskBoard.uploading', { pct: uploadProgress })
                        : hasComposerAttachment
                          ? t('chat.composerAttachmentHint')
                          : channelReadOnly
                          ? t('orgPanel.composerReadOnlyHint')
                          : isCrossTeam
                            ? t('workspace.projectChatCrossTeamComposerHint')
                            : isGeneral
                              ? t('workspace.projectChatGeneralComposerHint')
                              : t('orgPanel.composerFigmaHint', { ch: chSlug || 'channel' })
                    }
                    wrapperClassName="p-0 border-0 bg-transparent"
                    showSendButton
                    actionItems={[]}
                    leadingItems={[
                      {
                        key: 'upload-file',
                        title: t('orgPanel.menuUploadFile'),
                        content: <Paperclip className="h-4 w-4" strokeWidth={2} />,
                        className: 'w-9',
                        disabled: channelReadOnly,
                        onClick: () => fileInputRef.current?.click(),
                      },
                      {
                        key: 'upload-image',
                        title: t('orgPanel.menuUploadImage'),
                        content: <ImageIcon className="h-4 w-4" strokeWidth={2} />,
                        className: 'w-9',
                        disabled: channelReadOnly,
                        onClick: () => imageInputRef.current?.click(),
                      },
                      {
                        key: 'emoji',
                        title: t('orgPanel.emojiTab'),
                        content: <Smile className="h-4 w-4" strokeWidth={2} />,
                        className: 'w-9',
                        disabled: channelReadOnly,
                        onClick: () => {
                          setEmojiPickerTab('emoji');
                          setShowEmojiPicker((prev) => !prev);
                        },
                      },
                      {
                        key: 'context',
                        content: '🔗',
                        title: t('orgPanel.menuContextCall'),
                        className: 'w-9 text-base',
                        onClick: () => setContextPickerOpen((open) => !open),
                        disabled: channelReadOnly,
                      },
                    ]}
                  />
                </>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center px-6 text-sm text-muted-foreground">
            {t('workspace.projectChatSelectChannel')}
          </div>
        )}
      </section>

      <ComposerEmojiPicker
        open={showEmojiPicker && !isAnnouncement}
        onClose={() => setShowEmojiPicker(false)}
        onPick={appendEmoji}
        onPickMedia={handlePickChatMedia}
        mediaLoading={mediaPickerSending}
        activeTab={emojiPickerTab}
        onTabChange={setEmojiPickerTab}
        search={emojiSearch}
        onSearchChange={setEmojiSearch}
      />

      <ForwardChannelModal
        isOpen={forwardModalOpen}
        onClose={() => {
          setForwardModalOpen(false);
          setForwardSourceMessage(null);
        }}
        organizationName={selectedChannel?.projectName || ''}
        targets={forwardTargets}
        previewText={forwardPreviewText}
        onConfirm={async ({ channelIds, note }) => {
          const ok = await forwardMessage(forwardSourceMessage, channelIds, note);
          if (ok) {
            setForwardModalOpen(false);
            setForwardSourceMessage(null);
          }
        }}
      />

      <Modal
        isOpen={Boolean(deleteConfirmId)}
        onClose={() => setDeleteConfirmId(null)}
        title={t('organizations.deleteMsgTitle')}
        size="sm"
      >
        <p className="mb-4 text-sm text-muted-foreground">{t('organizations.deleteMsgMsg')}</p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-border px-3 py-2 text-sm"
            onClick={() => setDeleteConfirmId(null)}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white"
            onClick={async () => {
              const id = deleteConfirmId;
              setDeleteConfirmId(null);
              if (id) await deleteMessage(id);
            }}
          >
            {t('orgPanel.menuDeleteMessage')}
          </button>
        </div>
      </Modal>

      <ChatContextPreview
        target={previewTarget}
        t={t}
        apiCtx={apiCtx}
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
          boardCards={workDetail.boardCards || []}
          lists={workDetail.lists || []}
          epics={workDetail.epics || []}
          features={workDetail.features || []}
          sprints={workDetail.sprints || []}
          apiCtx={apiCtx}
          isDarkMode={isDarkMode}
          locale={locale}
          initialPanel={workDetail.initialPanel || 'detail'}
          canViewMembers={canViewMembers}
          onClose={() => setWorkDetail(null)}
          onPatchBoardCards={(updater) => {
            setWorkDetail((prev) => {
              if (!prev) return prev;
              const nextCards =
                typeof updater === 'function' ? updater(prev.boardCards || []) : updater;
              const wid = String(prev.workItem?._id || prev.workItem?.id || '');
              const nextItem =
                (nextCards || []).find((c) => String(c._id || c.id) === wid) || prev.workItem;
              return { ...prev, boardCards: nextCards || [], workItem: nextItem };
            });
          }}
          onUpdateCard={async (cardId, patch) => {
            setWorkDetail((prev) => {
              if (!prev?.workItem) return prev;
              const wid = String(prev.workItem._id || prev.workItem.id);
              if (wid !== String(cardId)) return prev;
              const nextItem = { ...prev.workItem, ...patch };
              const nextCards = (prev.boardCards || []).map((c) =>
                String(c._id || c.id) === String(cardId) ? { ...c, ...patch } : c
              );
              return { ...prev, workItem: nextItem, boardCards: nextCards };
            });
            const keys = Object.keys(patch || {});
            if (keys.length === 1 && keys[0] === 'comments') return;
            await taskAPI.updateBoardCard(cardId, patch, apiCtx);
          }}
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
