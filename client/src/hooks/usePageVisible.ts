import { useSyncExternalStore } from "react";

const subscribe = (callback: () => void) => {
  document.addEventListener("visibilitychange", callback);
  return () => document.removeEventListener("visibilitychange", callback);
};

export default function usePageVisible() {
  return useSyncExternalStore(
    subscribe,
    () => document.visibilityState === "visible",
    () => false,
  );
}
