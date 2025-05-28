import { createContext } from "react";

export interface GlobalContextValue {
  lastVisitDate: Date | null;
}

export const GLOBAL_CONTEXT_DEFAULT_VALUE: GlobalContextValue = {
  lastVisitDate: null,
};

export const GlobalContext = createContext<GlobalContextValue>(
  GLOBAL_CONTEXT_DEFAULT_VALUE,
);

export default GlobalContext;
