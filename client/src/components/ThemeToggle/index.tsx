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
      className="theme-toggle flex h-11 w-full shrink-0 cursor-pointer items-center justify-start gap-2 rounded-md border-0 bg-background-light px-3 whitespace-nowrap hover:bg-background-lighter focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:w-11 sm:justify-center sm:border sm:border-control sm:px-0 md:w-auto md:justify-start md:px-3 lg:w-full"
    >
      <Icon
        path={paper ? mdiWeatherSunny : mdiWeatherNight}
        size={0.8}
        aria-hidden="true"
      />
      <span className="text-sm font-medium sm:hidden md:inline">
        {paper ? "纸张浅色" : "水墨深色"}
      </span>
    </button>
  );
}
