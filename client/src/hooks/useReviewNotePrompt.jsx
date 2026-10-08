import { useCallback, useRef, useState } from 'react';

import ReviewNoteDialog from '../components/Shared/ReviewNoteDialog';

/**
 * Promise-based note modal — replaces window.prompt for review reasons.
 * @returns {{ requestNote: (opts) => Promise<string|null>, noteDialog: JSX.Element }}
 */
export default function useReviewNotePrompt() {
  const [dialog, setDialog] = useState(null);
  const resolveRef = useRef(null);
  const settledRef = useRef(false);

  const finish = useCallback((value) => {
    if (settledRef.current) return;
    settledRef.current = true;
    const resolve = resolveRef.current;
    resolveRef.current = null;
    setDialog(null);
    resolve?.(value);
  }, []);

  const requestNote = useCallback((opts = {}) => {
    settledRef.current = false;
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setDialog({
        title: opts.title || '',
        description: opts.description || '',
        placeholder: opts.placeholder || '',
        submitLabel: opts.submitLabel || '',
        variant: opts.variant || 'generic',
        maxLength: opts.maxLength != null ? opts.maxLength : 1000,
        noteOptional: Boolean(opts.noteOptional),
      });
    });
  }, []);

  const onDialogClose = useCallback(() => finish(null), [finish]);
  const onDialogSubmit = useCallback((note) => finish(note), [finish]);

  const noteDialog = (
    <ReviewNoteDialog
      isOpen={Boolean(dialog)}
      onClose={onDialogClose}
      onSubmit={onDialogSubmit}
      title={dialog?.title || ''}
      description={dialog?.description || ''}
      placeholder={dialog?.placeholder || ''}
      submitLabel={dialog?.submitLabel || undefined}
      variant={dialog?.variant || 'generic'}
      maxLength={dialog?.maxLength ?? 1000}
      noteOptional={Boolean(dialog?.noteOptional)}
    />
  );

  return { requestNote, noteDialog };
}
