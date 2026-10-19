import { Loader2 } from 'lucide-react';

/**
 * Blocking wait while a Gate 1 / Gate 2 approve request is in flight.
 * Sits under review note dialogs (z-[10050]) so a force-reason prompt stays usable.
 */
export default function GateActionOverlay({ message, hint }) {
  if (!message) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-background/80 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-busy="true"
      aria-live="polite"
      aria-label={message}
    >
      <div className="mx-4 w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-lg">
        <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" aria-hidden />
        <p className="mt-4 text-center text-base font-semibold text-foreground">{message}</p>
        {hint ? <p className="mt-1.5 text-center text-sm text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  );
}
