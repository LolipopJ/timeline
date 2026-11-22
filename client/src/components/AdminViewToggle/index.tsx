import { mdiEyeOutline, mdiShieldAccountOutline } from "@mdi/js";
import Icon from "@mdi/react";
import { useContext } from "react";

import GlobalContext from "@/contexts/GlobalContext";

export default function AdminViewToggle({ className }: { className: string }) {
  const { isLoggedIn, view, setView } = useContext(GlobalContext);
  const label = view === "public" ? "访客预览" : "管理员模式";

  if (!isLoggedIn) return null;

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={view === "public"}
      title={label}
      onClick={(event) => {
        event.currentTarget.focus({ preventScroll: true });
        setView(view === "public" ? "admin" : "public");
      }}
      className={`${className} grid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-safe:transition-colors`}
    >
      <Icon
        path={view === "public" ? mdiEyeOutline : mdiShieldAccountOutline}
        size={1}
        aria-hidden="true"
      />
    </button>
  );
}
