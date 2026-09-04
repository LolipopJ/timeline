import { createContext } from "react";

export interface GlobalContextValue {
  lastVisitDate: Date | null;
  isLoggedIn: boolean;
}

export const GLOBAL_CONTEXT_DEFAULT_VALUE: GlobalContextValue = {
  lastVisitDate: null,
  isLoggedIn: false,
};

export const GlobalContext = createContext<GlobalContextValue>(
  GLOBAL_CONTEXT_DEFAULT_VALUE,
);

export default GlobalContext;
