import { mdiEyeOutline, mdiShieldAccountOutline } from "@mdi/js";
import Icon from "@mdi/react";
import { type RefObject, useContext } from "react";

import GlobalContext from "@/contexts/GlobalContext";

export default function AdminViewToggle({
  focusRef,
}: {
  focusRef: RefObject<boolean>;
}) {
  const { isLoggedIn, view, setView } = useContext(GlobalContext);
  const label = view === "public" ? "访客预览" : "管理员模式";

  if (!isLoggedIn) return null;

  return (
    <button
      ref={(element) => {
        // Switching views remounts this control with the data cache.
        if (element && focusRef.current) {
          focusRef.current = false;
          element.focus({ preventScroll: true });
        }
      }}
      type="button"
      aria-label={label}
      aria-pressed={view === "public"}
      title={label}
      onClick={() => {
        focusRef.current = true;
        setView(view === "public" ? "admin" : "public");
      }}
      className="flex h-11 w-full shrink-0 cursor-pointer items-center justify-start gap-2 rounded-md border-0 bg-background-light px-3 whitespace-nowrap hover:bg-background-lighter focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:w-11 sm:justify-center sm:border sm:border-control sm:px-0 md:w-auto md:justify-start md:px-3 lg:w-full"
    >
      <Icon
        path={view === "public" ? mdiEyeOutline : mdiShieldAccountOutline}
        size={0.8}
        aria-hidden="true"
      />
      <span className="text-sm font-medium sm:hidden md:inline">{label}</span>
    </button>
  );
}
