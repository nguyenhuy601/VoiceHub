import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  detectSuiteFromPath,
  getDefaultPathForSuite,
  normalizeSuite,
  readStoredSuite,
  SUITE,
  writeStoredSuite,
} from '../utils/suitePathUtils';

const WorkspaceSuiteContext = createContext({
  currentSuite: SUITE.COMMUNICATE,
  setSuite: () => {},
  navigateToSuite: () => {},
});

export function WorkspaceSuiteProvider({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [currentSuite, setCurrentSuiteState] = useState(() => readStoredSuite());

  useEffect(() => {
    const fromPath = detectSuiteFromPath(location.pathname);
    if (fromPath && fromPath !== currentSuite) {
      setCurrentSuiteState(fromPath);
      writeStoredSuite(fromPath);
    }
  }, [location.pathname, currentSuite]);

  const setSuite = useCallback((suite) => {
    const next = normalizeSuite(suite);
    setCurrentSuiteState(next);
    writeStoredSuite(next);
  }, []);

  const navigateToSuite = useCallback(
    (suite, options = {}) => {
      const next = normalizeSuite(suite);
      const { replace = false, path } = options;
      setSuite(next);
      navigate(path || getDefaultPathForSuite(next), { replace });
    },
    [navigate, setSuite]
  );

  const value = useMemo(
    () => ({
      currentSuite,
      setSuite,
      navigateToSuite,
    }),
    [currentSuite, setSuite, navigateToSuite]
  );

  return (
    <WorkspaceSuiteContext.Provider value={value}>{children}</WorkspaceSuiteContext.Provider>
  );
}

export function useWorkspaceSuite() {
  return useContext(WorkspaceSuiteContext);
}

export { WorkspaceSuiteContext, SUITE };
