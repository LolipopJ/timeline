import type { TimelineView } from "@timeline/contracts";
import { createContext } from "react";

export interface GlobalContextValue {
  lastVisitDate: Date | null;
  isLoggedIn: boolean;
  view: TimelineView;
  setView: (view: TimelineView) => void;
  canManageItems: boolean;
  isLoggingOut: boolean;
  logout: () => Promise<void>;
}

export const GLOBAL_CONTEXT_DEFAULT_VALUE: GlobalContextValue = {
  lastVisitDate: null,
  isLoggedIn: false,
  view: "public",
  setView: () => {},
  canManageItems: false,
  isLoggingOut: false,
  logout: async () => {},
};

export const GlobalContext = createContext<GlobalContextValue>(
  GLOBAL_CONTEXT_DEFAULT_VALUE,
);

export default GlobalContext;
