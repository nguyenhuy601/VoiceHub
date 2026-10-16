/**
 * Friend graph pending retired — always empty badge / list.
 * Keeps callers (nav badges) compiling without network.
 */
export function useFriendPending() {
  return {
    data: [],
    pendingCount: 0,
    pendingList: [],
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: async () => ({ data: [] }),
  };
}
