import { useRef, useState } from 'react';
import { Link2, Paperclip } from 'lucide-react';
import toast from 'react-hot-toast';
import { resolveApiErrorMessage } from '../../../../utils/resolveApiErrorMessage';
import { uploadTaskBoardAttachment } from '../../taskBoardAttachmentUpload';
import {
  FIGMA_ORG_TASK_MODAL_INPUT,
  FIGMA_ORG_TASK_MODAL_PRIMARY_BTN,
} from '../../figmaOrganizationClasses';
import { useWorkItemDetail } from './WorkItemDetailContext';

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
            <li key={`${a.url}-${i}`}>
              <a
                href={a.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 text-sm text-primary hover:underline"
              >
                <Link2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {a.name || a.url}
              </a>
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
            try {
              const item = await uploadTaskBoardAttachment(file, setUploadProgress, { t, locale });
              const next = [...attachments, item];
              setAttachments(next);
              await save({ attachments: next });
              toast.success(t('taskBoard.fileAttached'));
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
            const next = [...attachments, { url, name }];
            setAttachments(next);
            await save({ attachments: next });
            setAttachUrl('');
            setAttachName('');
          }}
        >
          {t('taskBoard.insertLink')}
        </button>
      </div>
    </div>
  );
}
