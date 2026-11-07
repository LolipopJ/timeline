let probe: HTMLDivElement | null = null;
let cachedSmallViewportHeight = 0;

if (typeof window !== "undefined") {
  window.addEventListener("resize", () => {
    cachedSmallViewportHeight = 0;
  });
}

export function getSmallViewportHeight() {
  if (cachedSmallViewportHeight > 0 && probe?.isConnected) {
    return cachedSmallViewportHeight;
  }
  if (!probe) {
    probe = document.createElement("div");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText =
      "position:fixed;top:0;left:0;width:0;height:100svh;visibility:hidden;pointer-events:none";
  }
  if (!probe.isConnected) {
    (document.body ?? document.documentElement).appendChild(probe);
  }
  cachedSmallViewportHeight =
    probe.getBoundingClientRect().height || window.innerHeight;
  return cachedSmallViewportHeight;
}
