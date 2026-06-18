import { useCallback, useRef } from "react";

export function useManualRefresh(callback: () => void | Promise<void>) {
  const refreshingRef = useRef(false);

  return useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    try {
      await callback();
    } finally {
      refreshingRef.current = false;
    }
  }, [callback]);
}
