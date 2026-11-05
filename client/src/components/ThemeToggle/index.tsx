import { mdiWeatherNight, mdiWeatherSunny } from "@mdi/js";
import Icon from "@mdi/react";
import { useState } from "react";

import { THEME_STORAGE_KEY } from "@/utils/theme";

export default function ThemeToggle() {
  // The timeline mounts after hydration and the head script has already run.
  const [paper, setPaper] = useState(
    () => document.documentElement.dataset.theme === "paper",
  );

  function toggle() {
    const theme = paper ? "dark" : "paper";
    document.documentElement.dataset.theme = theme;
    setPaper(!paper);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // The current page still uses the selected theme.
    }
  }

  return (
    <button
      type="button"
      aria-label="纸张浅色主题"
      aria-pressed={paper}
      title={paper ? "当前：纸张浅色" : "当前：水墨深色"}
      onClick={toggle}
      className="flex size-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md border border-control bg-background-light text-primary hover:bg-background-lighter lg:w-full lg:justify-start lg:px-3"
    >
      <Icon
        path={paper ? mdiWeatherSunny : mdiWeatherNight}
        size={0.8}
        aria-hidden="true"
      />
      <span className="hidden text-sm font-medium lg:inline">
        {paper ? "纸张浅色" : "水墨深色"}
      </span>
    </button>
  );
}
