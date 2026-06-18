import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type SaveHandler = {
  id: string;
  save: () => void | Promise<void>;
  canSave?: () => boolean;
};

type StealthSettingsSaveContextValue = {
  register: (handler: SaveHandler) => () => void;
  runAllSaves: () => Promise<void>;
  busy: boolean;
};

const StealthSettingsSaveContext = createContext<StealthSettingsSaveContextValue | null>(null);

export function StealthSettingsSaveProvider({ children }: { children: ReactNode }) {
  const handlersRef = useRef(new Map<string, SaveHandler>());
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);

  const register = useCallback((handler: SaveHandler) => {
    handlersRef.current.set(handler.id, handler);
    tick((n) => n + 1);
    return () => {
      handlersRef.current.delete(handler.id);
      tick((n) => n + 1);
    };
  }, []);

  const runAllSaves = useCallback(async () => {
    setBusy(true);
    try {
      for (const handler of handlersRef.current.values()) {
        if (handler.canSave?.() === false) continue;
        await handler.save();
      }
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <StealthSettingsSaveContext.Provider value={{ register, runAllSaves, busy }}>
      {children}
    </StealthSettingsSaveContext.Provider>
  );
}

export function useStealthSettingsSave() {
  const ctx = useContext(StealthSettingsSaveContext);
  if (!ctx) {
    throw new Error("useStealthSettingsSave must be used within StealthSettingsSaveProvider");
  }
  return ctx;
}

export function useRegisterSettingsSave(
  id: string,
  save: () => void | Promise<void>,
  canSave?: () => boolean,
) {
  const { register } = useStealthSettingsSave();
  const saveRef = useRef(save);
  const canSaveRef = useRef(canSave);
  saveRef.current = save;
  canSaveRef.current = canSave;

  useEffect(() => {
    return register({
      id,
      save: () => saveRef.current(),
      canSave: () => canSaveRef.current?.() ?? true,
    });
  }, [id, register]);
}
