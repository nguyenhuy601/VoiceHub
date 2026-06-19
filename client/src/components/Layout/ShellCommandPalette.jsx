import { useCallback, useEffect, useState } from 'react';
import DashboardGlobalSearchModal from '../Dashboard/DashboardGlobalSearchModal';

/**
 * Global ⌘K / Ctrl+K — tái dùng DashboardGlobalSearchModal.
 */
export default function ShellCommandPalette() {
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const onKey = (e) => {
      const isK = e.key === 'k' || e.key === 'K';
      if (!isK) return;
      if (!(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      setOpen((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <DashboardGlobalSearchModal
      isOpen={open}
      onClose={close}
      layer1Query=""
    />
  );
}
