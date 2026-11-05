export const THEME_STORAGE_KEY = "timeline-theme";

// A static script in the document head applies the theme before React loads.
export const THEME_INIT_SCRIPT = `(() => {
  let theme;
  try {
    theme = localStorage.getItem("${THEME_STORAGE_KEY}");
  } catch {}
  if (theme !== "dark" && theme !== "paper") {
    theme = window.matchMedia?.("(prefers-color-scheme: light)").matches ? "paper" : "dark";
    try {
      localStorage.setItem("${THEME_STORAGE_KEY}", theme);
    } catch {}
  }
  document.documentElement.dataset.theme = theme;
})();`;
