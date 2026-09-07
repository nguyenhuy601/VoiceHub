import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const ShellLayoutContext = createContext({
  joinModalOpen: false,
  openJoinModal: () => {},
  closeJoinModal: () => {},
  mobileNavOpen: false,
  openMobileNav: () => {},
  closeMobileNav: () => {},
  immersiveChrome: false,
  setImmersiveChrome: () => {},
});

export function ShellLayoutProvider({ children }) {
  const [joinModalOpen, setJoinModalOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [immersiveChrome, setImmersiveChrome] = useState(false);

  const openJoinModal = useCallback(() => setJoinModalOpen(true), []);
  const closeJoinModal = useCallback(() => setJoinModalOpen(false), []);
  const openMobileNav = useCallback(() => setMobileNavOpen(true), []);
  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);
  const setImmersiveChromeSafe = useCallback((next) => {
    setImmersiveChrome(Boolean(next));
  }, []);

  useEffect(() => {
    if (!mobileNavOpen) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') closeMobileNav();
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileNavOpen, closeMobileNav]);

  const value = useMemo(
    () => ({
      joinModalOpen,
      openJoinModal,
      closeJoinModal,
      mobileNavOpen,
      openMobileNav,
      closeMobileNav,
      immersiveChrome,
      setImmersiveChrome: setImmersiveChromeSafe,
    }),
    [
      joinModalOpen,
      openJoinModal,
      closeJoinModal,
      mobileNavOpen,
      openMobileNav,
      closeMobileNav,
      immersiveChrome,
      setImmersiveChromeSafe,
    ]
  );

  return (
    <ShellLayoutContext.Provider value={value}>{children}</ShellLayoutContext.Provider>
  );
}

export function useShellLayout() {
  return useContext(ShellLayoutContext);
}

export { ShellLayoutContext };
