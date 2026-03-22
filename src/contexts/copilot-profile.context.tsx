import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  listCopilotProfiles,
  getActiveCopilotProfileId,
  setActiveCopilotProfileId,
  type CopilotProfile,
} from "@/lib/database/copilot-profiles.action";

type CopilotProfileContextValue = {
  profiles: CopilotProfile[];
  activeProfile: CopilotProfile | null;
  activeProfileId: string | null;
  setActiveProfileId: (id: string | null) => void;
  refreshProfiles: () => Promise<void>;
  loading: boolean;
};

const CopilotProfileContext = createContext<
  CopilotProfileContextValue | undefined
>(undefined);

export function CopilotProfileProvider({ children }: { children: ReactNode }) {
  const [profiles, setProfiles] = useState<CopilotProfile[]>([]);
  const [activeProfileId, setActiveIdState] = useState<string | null>(() =>
    getActiveCopilotProfileId()
  );
  const [loading, setLoading] = useState(true);

  const refreshProfiles = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listCopilotProfiles();
      setProfiles(list);
      const stored = getActiveCopilotProfileId();
      if (stored && !list.some((p) => p.id === stored)) {
        setActiveCopilotProfileId(null);
        setActiveIdState(null);
      } else {
        setActiveIdState(stored);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshProfiles();
  }, [refreshProfiles]);

  const setActiveProfileId = useCallback((id: string | null) => {
    setActiveIdState(id);
    setActiveCopilotProfileId(id);
  }, []);

  const activeProfile = useMemo(() => {
    if (!activeProfileId) return null;
    return profiles.find((p) => p.id === activeProfileId) ?? null;
  }, [profiles, activeProfileId]);

  const value = useMemo(
    () => ({
      profiles,
      activeProfile,
      activeProfileId,
      setActiveProfileId,
      refreshProfiles,
      loading,
    }),
    [
      profiles,
      activeProfile,
      activeProfileId,
      setActiveProfileId,
      refreshProfiles,
      loading,
    ]
  );

  return (
    <CopilotProfileContext.Provider value={value}>
      {children}
    </CopilotProfileContext.Provider>
  );
}

export function useCopilotProfile(): CopilotProfileContextValue {
  const ctx = useContext(CopilotProfileContext);
  if (!ctx) {
    throw new Error("useCopilotProfile must be used within CopilotProfileProvider");
  }
  return ctx;
}

/** Safe for overlay tree: returns null provider if context missing */
export function useActiveProfileOptional(): CopilotProfileContextValue | null {
  return useContext(CopilotProfileContext) ?? null;
}
