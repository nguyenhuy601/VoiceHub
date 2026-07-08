import { createContext, useCallback, useContext, useMemo, useState } from 'react';

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
