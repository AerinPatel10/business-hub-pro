import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export type AccountMode = "invoice" | "estimate";

interface AccountModeCtx {
  mode: AccountMode;
  setMode: (m: AccountMode) => void;
  toggle: () => void;
}

const Ctx = createContext<AccountModeCtx | undefined>(undefined);
const KEY = "vyaparbook.accountMode";

export const AccountModeProvider = ({ children }: { children: ReactNode }) => {
  const [mode, setModeState] = useState<AccountMode>(() => {
    if (typeof window === "undefined") return "invoice";
    const v = window.localStorage.getItem(KEY);
    return v === "estimate" ? "estimate" : "invoice";
  });

  useEffect(() => {
    try { window.localStorage.setItem(KEY, mode); } catch { /* ignore */ }
  }, [mode]);

  const setMode = (m: AccountMode) => setModeState(m);
  const toggle = () => setModeState(m => (m === "invoice" ? "estimate" : "invoice"));

  return <Ctx.Provider value={{ mode, setMode, toggle }}>{children}</Ctx.Provider>;
};

export const useAccountMode = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAccountMode must be used within AccountModeProvider");
  return c;
};
