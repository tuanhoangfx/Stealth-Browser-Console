import { useCallback, useRef } from "react";

/** Double-click row opens profile; single click is ignored (selection via checkbox). */
export function useRowOpenOnDoubleClick<T>(getKey: (item: T) => string, onOpen: (item: T) => void) {
  const lastClickRef = useRef<{ key: string; time: number } | null>(null);

  return useCallback(
    (item: T) => {
      const key = getKey(item);
      const now = Date.now();
      if (lastClickRef.current?.key === key && now - lastClickRef.current.time < 400) {
        onOpen(item);
        lastClickRef.current = null;
        return;
      }
      lastClickRef.current = { key, time: now };
    },
    [getKey, onOpen]
  );
}
