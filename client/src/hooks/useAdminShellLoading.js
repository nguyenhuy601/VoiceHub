import { useCallback, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useShellLayout } from '../context/ShellLayoutContext';
import { useAppStrings } from '../locales/appStrings';

const TAB_LOADING_MS = 280;

/**
 * Header pill khi đổi domain / mục sidebar admin (pathname đổi → TopHeader clear).
 */
export function useAdminNavLoading() {
  const { t } = useAppStrings();
  const location = useLocation();
  const { showHeaderLoading, hideHeaderLoading } = useShellLayout();

  useEffect(() => {
    hideHeaderLoading();
  }, [location.pathname, hideHeaderLoading]);

  const markNavigating = useCallback(() => {
    showHeaderLoading(t('nav.adminModuleSwitching'));
  }, [showHeaderLoading, t]);

  return { markNavigating, hideHeaderLoading };
}

/**
 * Header pill khi đổi tab hub (?tab= / ?mode=) — pathname không đổi nên tự clear sau delay.
 * @param {string} activeKey — activeTab hoặc mode hiện tại
 */
export function useAdminTabLoading(activeKey) {
  const { t } = useAppStrings();
  const { showHeaderLoading, hideHeaderLoading } = useShellLayout();
  const prevKeyRef = useRef(activeKey);
  const skipFirstRef = useRef(true);

  const markTabSwitch = useCallback(
    (nextKey) => {
      if (String(nextKey || '') === String(activeKey || '')) return;
      showHeaderLoading(t('nav.adminTabSwitching'));
    },
    [activeKey, showHeaderLoading, t]
  );

  useEffect(() => {
    if (skipFirstRef.current) {
      skipFirstRef.current = false;
      prevKeyRef.current = activeKey;
      return undefined;
    }
    if (prevKeyRef.current === activeKey) return undefined;
    prevKeyRef.current = activeKey;
    const timer = window.setTimeout(() => hideHeaderLoading(), TAB_LOADING_MS);
    return () => window.clearTimeout(timer);
  }, [activeKey, hideHeaderLoading]);

  return { markTabSwitch };
}
