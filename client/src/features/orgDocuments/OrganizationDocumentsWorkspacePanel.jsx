import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAppStrings } from '../../locales/appStrings';
import { buildCompanyChatPath } from '../../utils/suitePathUtils';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import {
  isStoredObjectAttachment,
  openTaskBoardAttachment,
} from '../projects/board/taskBoardAttachmentOpen';
import {
  filterOrgFilesByScope,
  isSharedFilesCategory,
  resolveOrgFileOpenUrl,
  toDriveAttachmentRef,
} from './orgDocumentUtils';
import { useOrgDocumentCategoryMeta } from './useOrgDocumentCategoryMeta';
import {
  DRIVE_SCOPE,
  driveScopeEmptyKey,
  driveScopeHintKey,
  driveScopeTitleKey,
  resolveDriveScope,
} from './driveScope';
import DriveWorkspaceShell from './DriveWorkspaceShell';

/**
 * Tài liệu tổ chức — một Drive shell, corpus theo phòng/team/org.
 */
export default function OrganizationDocumentsWorkspacePanel({
  files = [],
  loading = false,
  error = '',
  onReload,
  isDarkMode: _isDarkMode,
  onOpenInWorkspace,
  panelTitle = '',
  scopeHint = '',
  departmentId = '',
  teamId = '',
  projectId = '',
  organizationId = '',
  departmentChannelIds = null,
  teamChannelIds = null,
  memberDepartmentIds = null,
  memberChannelIds = null,
  initialCategory = 'all',
}) {
  const { t } = useAppStrings();
  const navigate = useNavigate();
  const scope = resolveDriveScope({ organizationId, departmentId, teamId, projectId });
  const [openingFileId, setOpeningFileId] = useState(null);

  const scopedFiles = useMemo(
    () =>
      filterOrgFilesByScope(files, {
        departmentId,
        teamId,
        projectId,
        departmentChannelIds,
        teamChannelIds,
        memberDepartmentIds,
        memberChannelIds,
      }),
    [
      files,
      departmentId,
      teamId,
      projectId,
      departmentChannelIds,
      teamChannelIds,
      memberDepartmentIds,
      memberChannelIds,
    ]
  );

  const { categoryMeta, countsByCategory, totalBytes } = useOrgDocumentCategoryMeta(scopedFiles);
  const [activeCategory, setActiveCategory] = useState(initialCategory || 'all');
  const [docQuery, setDocQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const filteredFiles = useMemo(() => {
    let list = scopedFiles;
    if (activeCategory === 'shared') {
      list = list.filter((f) => isSharedFilesCategory(f.category));
    } else if (activeCategory !== 'all') {
      list = list.filter((f) => f.category === activeCategory);
    }
    const q = docQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter((f) => `${f.name} ${f.channelName} ${f.category}`.toLowerCase().includes(q));
  }, [scopedFiles, activeCategory, docQuery]);

  // Auto-select file đầu khi list có data / selection bị lọc mất.
  useEffect(() => {
    if (loading) return;
    if (!filteredFiles.length) {
      if (selectedId != null) setSelectedId(null);
      return;
    }
    const stillVisible = filteredFiles.some((f) => f.id === selectedId);
    if (!selectedId || !stillVisible) {
      setSelectedId(filteredFiles[0].id);
    }
  }, [filteredFiles, selectedId, loading]);

  const selectedFile = useMemo(
    () => filteredFiles.find((f) => f.id === selectedId) || null,
    [filteredFiles, selectedId]
  );

  const handleOpenFile = async (file) => {
    if (!file || openingFileId) return;
    const attachment = toDriveAttachmentRef(file);
    setOpeningFileId(file.id || 'opening');
    try {
      if (isStoredObjectAttachment(attachment)) {
        await openTaskBoardAttachment(attachment);
        return;
      }
      const url = resolveOrgFileOpenUrl(file);
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
        return;
      }
      toast.error(t('documents.orgOpenFileUnavailable'));
    } catch (err) {
      const rawMsg = String(err?.userMessage || err?.message || '');
      const looksStorage =
        /billing|MinIO|Firebase|kho lưu trữ|storage|503|CHAT_STORAGE/i.test(rawMsg);
      toast.error(
        looksStorage
          ? t('documents.orgOpenFileStorageDown')
          : resolveApiErrorMessage(err, {
              t,
              fallback: t('documents.orgOpenFileUnavailable'),
            })
      );
    } finally {
      setOpeningFileId(null);
    }
  };

  const handleBackToChat = () => {
    const orgId = String(organizationId || '').trim();
    if (!orgId) return;
    navigate(
      buildCompanyChatPath(orgId, {
        departmentId: departmentId || undefined,
        teamId: teamId || undefined,
      })
    );
  };

  const title = panelTitle || t(driveScopeTitleKey(scope));
  const hint = scopeHint || t(driveScopeHintKey(scope));
  const emptyMessage =
    scope === DRIVE_SCOPE.PROJECT && !files.length
      ? t('nav.projectDocumentsPhaseAHint')
      : t(driveScopeEmptyKey(scope));

  return (
    <DriveWorkspaceShell
      title={title}
      scopeHint={hint}
      files={filteredFiles}
      loading={loading}
      error={error}
      onReload={onReload}
      categoryMeta={categoryMeta}
      countsByCategory={countsByCategory}
      totalBytes={totalBytes}
      activeCategory={activeCategory}
      onCategoryChange={setActiveCategory}
      query={docQuery}
      onQueryChange={setDocQuery}
      selectedFile={selectedFile}
      onSelectFile={(file) => setSelectedId(file?.id || null)}
      onOpenFile={handleOpenFile}
      openingFile={Boolean(openingFileId)}
      onOpenInWorkspace={onOpenInWorkspace}
      onBackToChat={organizationId ? handleBackToChat : undefined}
      emptyMessage={emptyMessage}
    />
  );
}
