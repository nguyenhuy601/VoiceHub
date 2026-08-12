import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { FIGMA_PAGE_CARD_PAD } from '../../components/Layout/figmaPageClasses';
import { ConfirmDialog, GradientButton, Modal } from '../../components/Shared';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import api from '../../services/api';
import UserAvatar from '../../components/Shared/UserAvatar';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useOrganizationsMy } from '../../hooks/queries';
import { buildCollaborateDocumentsPath } from '../../utils/suitePathUtils';
import DocumentsFigmaView from '../../components/Documents/DocumentsFigmaView';
import {
  docTypeColor,
  formatRelativeVi,
  inferDocType,
  readOcrFromRaw,
} from '../../components/Documents/documentsUiUtils';
import { useLocale } from '../../context/LocaleContext';
import { hasBackendCapability } from '../../config/backendCapabilities';

const DOCUMENT_UPLOAD_ENABLED = hasBackendCapability('documentBinaryUpload');
const DOCUMENT_SHARE_ACL_ENABLED = hasBackendCapability('documentShareAcl');
const DOCUMENT_COPY_MOVE_ENABLED = hasBackendCapability('documentCopyMove');
const DOCUMENT_STAR_ENABLED = hasBackendCapability('documentStarred');

function DocumentsPage() {
  const { locale } = useLocale();
  const { t } = useAppStrings();
  const navigate = useNavigate();
  const { activeWorkspace } = useWorkspace();
  const orgsQuery = useOrganizationsMy();
  const [searchParams] = useSearchParams();
  const organizationId = String(
    searchParams.get('organizationId') || searchParams.get('orgId') || ''
  ).trim();
  const isOrgDocuments = Boolean(organizationId);

  const [selectedFile, setSelectedFile] = useState(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [deleteConfirmFileId, setDeleteConfirmFileId] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);

  const formatSize = (bytes) => {
    const n = Number(bytes);
    if (!Number.isFinite(n) || n <= 0) return '-';
    if (n < 1024) return `${Math.round(n)} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  };

  const mapDocument = (doc) => {
    const docType = inferDocType(doc);
    const { ocrStatus, ocrProgress } = readOcrFromRaw(doc);
    const updatedAt = doc.updatedAt || doc.createdAt;
    return {
      id: doc._id || doc.id,
      name: doc.name || doc.title || 'Document',
      type: String(doc.mimeType || '').includes('pdf') ? 'PDF' : '📄',
      docType,
      size: formatSize(doc.fileSize),
      category: doc.organizationId ? 'Workspace' : 'Personal',
      owner: doc.uploadedBy?.displayName || doc.uploadedBy?.username || 'VoiceHub',
      modified: updatedAt ? new Date(updatedAt).toLocaleDateString('vi-VN') : '',
      modifiedRelative: formatRelativeVi(updatedAt, { t, locale }),
      color: docTypeColor(docType),
      starred: false,
      shared: Boolean(doc.isPublic || doc.organizationId),
      ocrStatus,
      ocrProgress,
      locale,
      raw: doc,
    };
  };

  useEffect(() => {
    let cancelled = false;
    setDocumentsLoading(true);
    const params = { limit: 100 };
    if (isOrgDocuments) params.organizationId = organizationId;
    api
      .get('/documents', {
        params,
      })
      .then((response) => {
        if (cancelled) return;
        const body = response?.data ?? response;
        const inner = body?.data ?? body;
        const list = Array.isArray(inner?.documents) ? inner.documents : Array.isArray(inner) ? inner : [];
        setDocuments(list.map(mapDocument));
      })
      .catch((err) => {
        if (!cancelled) {
          setDocuments([]);
          toast.error(resolveApiErrorMessage(err, { t, fallback: t('documents.loadFail') }));
        }
      })
      .finally(() => {
        if (!cancelled) setDocumentsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOrgDocuments, organizationId, t]);

  const handleStarFile = (fileId) => {
    toast.success(t('documents.toastStar'));
  };

  const handleDownloadFile = (file) => {
    const url = file?.raw?.fileUrl || file?.raw?.url;
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    toast(t('documents.toastDownloading', { name: file.name }), { icon: '⬇️' });
  };

  const handleDeleteFile = async (fileId) => {
    if (!fileId) return;
    try {
      await api.delete(`/documents/${encodeURIComponent(String(fileId))}`);
      setDocuments((prev) => prev.filter((doc) => String(doc.id) !== String(fileId)));
      toast.success(t('documents.toastDeleted'));
    } catch (err) {
      toast.error(resolveApiErrorMessage(err, { t, fallback: t('documents.loadFail') }));
    } finally {
      setDeleteConfirmFileId(null);
    }
  };

  const handleShareFile = (file) => {
    if (!DOCUMENT_SHARE_ACL_ENABLED) return;
    setShowShareModal(file);
  };

  const handleUploadStart = () => {
    if (!DOCUMENT_UPLOAD_ENABLED) return;
    setShowUploadModal(true);
    // Simulate upload
    let progress = 0;
    const interval = setInterval(() => {
      progress += 10;
      setUploadProgress(progress);
      if (progress >= 100) {
        clearInterval(interval);
        setTimeout(() => {
          setShowUploadModal(false);
          setUploadProgress(0);
          toast.success(t('documents.toastUploadOk'));
        }, 500);
      }
    }, 200);
  };

  const renderModalCard = (children) => (
    <div className={FIGMA_PAGE_CARD_PAD}>{children}</div>
  );

  const handleUploadFiles = () => {
    handleUploadStart();
  };

  const figmaCenter = (
    <DocumentsFigmaView
      documents={documents}
      documentsLoading={documentsLoading}
      locale={locale}
      t={t}
      onView={setSelectedFile}
      onDownload={handleDownloadFile}
      onShare={DOCUMENT_SHARE_ACL_ENABLED ? handleShareFile : undefined}
      onDelete={(doc) => setDeleteConfirmFileId(doc.id)}
      onStar={DOCUMENT_STAR_ENABLED ? (doc) => handleStarFile(doc.id) : undefined}
      onUploadClick={DOCUMENT_UPLOAD_ENABLED ? handleUploadStart : undefined}
      onUploadFiles={DOCUMENT_UPLOAD_ENABLED ? handleUploadFiles : undefined}
    />
  );

  return (
    <>
      {figmaCenter}

    {/* File Preview Modal */}
    <Modal 
      isOpen={selectedFile !== null} 
      onClose={() => setSelectedFile(null)}
      title={selectedFile?.name}
      size="xl"
    >
      {selectedFile && (
        <div className="space-y-4">
          {/* File Preview */}
          <div className="glass-strong rounded-xl p-8 flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <div className={`w-32 h-32 rounded-2xl bg-gradient-to-br ${selectedFile.color} flex items-center justify-center text-6xl mb-6 mx-auto shadow-2xl`}>
                {selectedFile.type}
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">{selectedFile.name}</h3>
              <p className="text-gray-400 mb-4">{selectedFile.size} • {selectedFile.category}</p>
              <div className="flex items-center justify-center gap-4 text-sm text-gray-500">
                <span>👤 {selectedFile.owner}</span>
                <span>•</span>
                <span>📅 {selectedFile.modified}</span>
              </div>
            </div>
          </div>

          {/* File Info & Actions */}
          <div className={`grid gap-4 ${DOCUMENT_SHARE_ACL_ENABLED ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {renderModalCard(
              <>
              <h4 className="font-bold mb-3 flex items-center gap-2 text-foreground">
                <span>ℹ️</span> {t('documents.fileInfoTitle')}
              </h4>
              <div className="space-y-2 text-sm text-muted-foreground">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('documents.typeLabel')}</span>
                  <span className="font-semibold text-foreground">{selectedFile.category}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('documents.sizeLabel')}</span>
                  <span className="font-semibold text-foreground">{selectedFile.size}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('documents.ownerLabel')}</span>
                  <span className="font-semibold text-foreground">{selectedFile.owner}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('documents.editedLabel')}</span>
                  <span className="font-semibold text-foreground">{selectedFile.modified}</span>
                </div>
              </div>
              </>
            )}

            {DOCUMENT_SHARE_ACL_ENABLED && renderModalCard(
              <>
              <h4 className="font-bold mb-3 flex items-center gap-2 text-foreground">
                <span>👥</span> {t('documents.accessRights')}
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <UserAvatar name={selectedFile.owner} size="xs" />
                  <div className="flex-1">
                    <div className="font-semibold text-foreground">{selectedFile.owner}</div>
                    <div className="text-xs text-muted-foreground">{t('documents.roleOwner')}</div>
                  </div>
                </div>
              </div>
              </>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <GradientButton 
              variant="primary" 
              onClick={() => handleDownloadFile(selectedFile)}
              className="flex-1"
            >
              {t('documents.downloadBtn')}
            </GradientButton>
            {DOCUMENT_SHARE_ACL_ENABLED && (
              <GradientButton
                variant="secondary"
                onClick={() => {
                  setShowShareModal(selectedFile);
                  setSelectedFile(null);
                }}
                className="flex-1"
              >
                {t('documents.shareBtn')}
              </GradientButton>
            )}
            <button 
              onClick={() => setSelectedFile(null)}
              className="glass px-6 py-3 rounded-xl hover:bg-white/10 transition-all font-semibold"
            >
              {t('documents.close')}
            </button>
          </div>
        </div>
      )}
    </Modal>

    {/* Upload Progress Modal */}
    <Modal 
      isOpen={DOCUMENT_UPLOAD_ENABLED && showUploadModal} 
      onClose={() => {}}
      title={t('documents.uploadingTitle')}
      size="md"
    >
      <div className="space-y-4">
        {renderModalCard(
          <>
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-2xl">
              📄
            </div>
            <div className="flex-1">
              <div className="font-bold text-foreground">Document.pdf</div>
              <div className="text-sm text-muted-foreground">2.4 MB</div>
            </div>
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t('documents.progressLabel')}</span>
              <span className="font-bold text-foreground">{uploadProgress}%</span>
            </div>
            <div className="w-full h-2 glass-strong rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-purple-600 to-pink-600 transition-all duration-300"
                style={{width: `${uploadProgress}%`}}
              ></div>
            </div>
          </div>
          </>
        )}

        {uploadProgress === 100 && (
          <div className="text-center text-green-400 font-semibold animate-slideUp">
            {t('documents.uploadComplete')}
          </div>
        )}
      </div>
    </Modal>

    {/* Share Modal */}
    <Modal 
      isOpen={DOCUMENT_SHARE_ACL_ENABLED && showShareModal !== null} 
      onClose={() => setShowShareModal(null)}
      title={t('documents.shareModalTitle')}
      size="md"
    >
      {showShareModal && (
        <div className="space-y-4">
          {renderModalCard(
            <>
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${showShareModal.color} flex items-center justify-center text-2xl`}>
                {showShareModal.type}
              </div>
              <div>
                <div className="font-bold text-foreground">{showShareModal.name}</div>
                <div className="text-sm text-muted-foreground">{showShareModal.size}</div>
              </div>
            </div>
            </>
          )}

          <div>
            <label className="block text-sm font-semibold text-gray-400 mb-2">
              {t('documents.addUsersLabel')}
            </label>
            <div className="flex gap-2">
              <input 
                type="email"
                placeholder={t('documents.emailPlaceholder')}
                className="flex-1 glass px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-purple-500/50 focus:outline-none text-white placeholder-gray-500 transition-all"
              />
              <GradientButton
                variant="primary"
                type="button"
                onClick={() => toast(t('dashboard.toastInviteLater'), { icon: 'ℹ️' })}
              >
                {t('documents.add')}
              </GradientButton>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-400 mb-2">
              {t('documents.peopleAccess')}
            </label>
            <div className="space-y-2">
              {showShareModal.owner ? renderModalCard(
                <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <UserAvatar name={showShareModal.owner} size="md" />
                    <div>
                      <div className="font-semibold text-foreground">{showShareModal.owner}</div>
                    </div>
                  </div>
                  <select className="glass px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm">
                    <option>{t('documents.roleOwner')}</option>
                    <option>{t('documents.roleEdit')}</option>
                    <option>{t('documents.roleView')}</option>
                  </select>
                </div>
                </>
              ) : null}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-400 mb-2">
              {t('documents.shareLinkLabel')}
            </label>
            <div className="flex gap-2">
              <input 
                type="text"
                value=""
                readOnly
                placeholder={t('documents.shareLinkLabel')}
                className="flex-1 glass px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm"
              />
              <button 
                onClick={() => toast.success(t('documents.toastCopyLink'))}
                className="glass px-4 py-3 rounded-xl hover:bg-white/10 transition-all font-semibold"
              >
                {t('documents.copyLink')}
              </button>
            </div>
          </div>

          <div className="flex gap-3">
            <GradientButton 
              variant="primary" 
              onClick={() => {
                toast.success(t('documents.toastSaveShare'));
                setShowShareModal(null);
              }}
              className="flex-1"
            >
              {t('documents.saveChangesBtn')}
            </GradientButton>
            <button 
              onClick={() => setShowShareModal(null)}
              className="glass px-6 py-3 rounded-xl hover:bg-white/10 transition-all font-semibold"
            >
              {t('nav.cancel')}
            </button>
          </div>
        </div>
      )}
    </Modal>

    <ConfirmDialog
      isOpen={deleteConfirmFileId != null}
      onClose={() => setDeleteConfirmFileId(null)}
      onConfirm={() => {
        if (deleteConfirmFileId != null) handleDeleteFile(deleteConfirmFileId);
      }}
      title={t('documents.confirmFileDeleteTitle')}
      message={t('documents.confirmFileDeleteMsg')}
      confirmText={t('common.delete')}
      cancelText={t('nav.cancel')}
    />
    </>
  );
}

function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="text-8xl mb-6 animate-float">🚀</div>
        <h1 className="text-6xl font-black text-gradient mb-4">404</h1>
        <p className="text-2xl text-gray-400 mb-8">Lost in space?</p>
        <Link to="/">
          <GradientButton variant="primary">Go Home</GradientButton>
        </Link>
      </div>
    </div>
  );
}

// ============= NOTIFICATIONS PAGE =============

export default DocumentsPage;
