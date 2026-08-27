import { useRef, useState } from 'react';
import { Link2, Paperclip, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { resolveApiErrorMessage } from '../../../../utils/resolveApiErrorMessage';
import { uploadTaskBoardAttachment } from '../../board/taskBoardAttachmentUpload';
import { openTaskBoardAttachment, isStoredObjectAttachment } from '../../board/taskBoardAttachmentOpen';
import {
  FIGMA_ORG_TASK_MODAL_INPUT,
  FIGMA_ORG_TASK_MODAL_PRIMARY_BTN,
} from '../../../../components/Organization/figmaOrganizationClasses';
import { useWorkItemDetail } from './WorkItemDetailContext';

function AttachmentLink({ attachment, t }) {
  const [opening, setOpening] = useState(false);
  const label = attachment.name || attachment.url || attachment.storagePath || '';
  const stored = isStoredObjectAttachment(attachment);

  if (stored) {
    return (
      <button
        type="button"
        disabled={opening}
        onClick={async () => {
          setOpening(true);
          try {
            await openTaskBoardAttachment(attachment);
          } catch (err) {
            toast.error(resolveApiErrorMessage(err, { t, fallback: t('taskBoard.openAttachmentFail') }));
          } finally {
            setOpening(false);
          }
        }}
        className="flex items-center gap-2 text-sm text-primary hover:underline disabled:opacity-60"
      >
        <Link2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {opening ? t('taskBoard.openingAttachment') : label}
      </button>
    );
  }

  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-2 text-sm text-primary hover:underline"
    >
      <Link2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {label}
    </a>
  );
}

export default function AttachmentsTab() {
  const {
    isPlanning,
    t,
    locale,
    attachments,
    setAttachments,
    saving,
    save,
  } = useWorkItemDetail();
  const fileInputRef = useRef(null);
  const [attachUrl, setAttachUrl] = useState('');
  const [attachName, setAttachName] = useState('');
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  if (isPlanning) {
    return (
      <p className="px-1 py-2 text-sm text-muted-foreground">{t('workspace.projectHubWorkNone')}</p>
    );
  }

  return (
    <div className="space-y-4 px-1 py-1">
      <div className="flex items-center gap-2">
        <Paperclip className="h-4 w-4 opacity-70" aria-hidden />
        <h4 className="text-sm font-semibold">{t('workspace.projectHubWorkTabAttachments')}</h4>
      </div>

      {attachments.length > 0 ? (
        <ul className="space-y-1">
          {attachments.map((a, i) => (
            <li
              key={`${a.storagePath || a.url}-${i}`}
              className="flex items-center justify-between gap-2"
            >
              <AttachmentLink attachment={a} t={t} />
              <button
                type="button"
                disabled={saving}
                className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                title={t('taskBoard.removeAttachment')}
                aria-label={t('taskBoard.removeAttachment')}
                onClick={async () => {
                  const prev = attachments;
                  const next = attachments.filter((_, idx) => idx !== i);
                  setAttachments(next);
                  try {
                    await save({ attachments: next });
                  } catch {
                    setAttachments(prev);
                  }
                }}
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">{t('workspace.projectHubWorkNone')}</p>
      )}

      <div>
        <p className="mb-2 text-xs text-muted-foreground">{t('taskBoard.uploadFromComputer')}</p>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file || uploadingFile) return;
            setUploadingFile(true);
            setUploadProgress(0);
            const prev = attachments;
            try {
              const item = await uploadTaskBoardAttachment(file, setUploadProgress, { t, locale });
              const next = [...attachments, item];
              setAttachments(next);
              try {
                await save({ attachments: next });
              } catch {
                setAttachments(prev);
              }
            } catch (err) {
              toast.error(resolveApiErrorMessage(err, { t, fallback: t('taskBoard.uploadFail') }));
            } finally {
              setUploadingFile(false);
              setUploadProgress(0);
            }
          }}
        />
        <button
          type="button"
          disabled={uploadingFile || saving}
          onClick={() => fileInputRef.current?.click()}
          className="mb-3 w-full rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
        >
          {uploadingFile
            ? t('taskBoard.uploading', { pct: uploadProgress })
            : t('taskBoard.chooseFile')}
        </button>
        <p className="mb-2 text-xs text-muted-foreground">{t('taskBoard.orPasteLink')}</p>
        <input
          value={attachUrl}
          onChange={(e) => setAttachUrl(e.target.value)}
          placeholder="https://..."
          className={`mb-2 w-full ${FIGMA_ORG_TASK_MODAL_INPUT}`}
        />
        <input
          value={attachName}
          onChange={(e) => setAttachName(e.target.value)}
          placeholder={t('taskBoard.linkTextPh')}
          className={`mb-3 w-full ${FIGMA_ORG_TASK_MODAL_INPUT}`}
        />
        <button
          type="button"
          disabled={!attachUrl.trim() || saving || uploadingFile}
          className={FIGMA_ORG_TASK_MODAL_PRIMARY_BTN}
          onClick={async () => {
            const url = attachUrl.trim();
            const name = attachName.trim() || url;
            const prev = attachments;
            const next = [...attachments, { url, name }];
            setAttachments(next);
            try {
              await save({ attachments: next });
              setAttachUrl('');
              setAttachName('');
            } catch {
              setAttachments(prev);
            }
          }}
        >
          {t('taskBoard.insertLink')}
        </button>
      </div>
    </div>
  );
}
