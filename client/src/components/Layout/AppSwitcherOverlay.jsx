export default function AppSwitcherOverlay({ open, onClose, closeAriaLabel = 'Close suite menu' }) {
  if (!open) return null;
  return (
    <button
      type="button"
      aria-label={closeAriaLabel}
      className="fixed inset-x-0 bottom-0 top-14 z-[150] bg-background/40 backdrop-blur-[6px] transition"
      onClick={onClose}
    />
  );
}
