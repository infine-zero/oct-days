(() => {
  "use strict";
  const root = document.documentElement;
  const themeKey = "oct-days-theme";

  if (root.hasAttribute("data-postbox")) {
    const theme = new URL(window.location.href).searchParams.get("theme");
    if (theme === "day" || theme === "night") {
      root.dataset.theme = theme;
      try { sessionStorage.setItem(themeKey, theme); } catch {}
    } else {
      try { root.dataset.theme = sessionStorage.getItem(themeKey) === "day" ? "day" : "night"; }
      catch { root.dataset.theme = "night"; }
    }
    document.querySelector('meta[name="theme-color"]').content = root.dataset.theme === "day" ? "#ffffff" : "#101b20";
    return;
  }

  const link = document.querySelector("a[data-oct-days-postbox]");
  if (!link) return;
  function updateLink() {
    const url = new URL(link.href);
    url.searchParams.set("theme", root.dataset.theme === "day" ? "day" : "night");
    link.href = url.href;
  }
  updateLink();
  new MutationObserver(updateLink).observe(root, { attributeFilter: ["data-theme"] });
})();
