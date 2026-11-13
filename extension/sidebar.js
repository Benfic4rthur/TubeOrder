(function () {
  "use strict";
  if (globalThis.__tubeOrderSidebarLoaded) return;
  globalThis.__tubeOrderSidebarLoaded = true;

  let lastVideo = null;
  let frame = null;
  let settleTimer = null;

  function videoKey() {
    const url = new URL(location.href);
    return url.pathname.replace(/\/$/, "") === "/watch" && url.searchParams.get("list") === "WL"
      ? url.searchParams.get("v") : null;
  }

  function panel() {
    return Array.from(document.querySelectorAll("ytd-playlist-panel-renderer"))
      .find(node => !node.closest("[hidden]"));
  }

  function currentRow(renderer, videoId) {
    return Array.from(renderer?.querySelectorAll("ytd-playlist-panel-video-renderer") || []).find(node => {
      const link = node.querySelector("a[href*='watch?']");
      try { return new URL(link?.getAttribute("href"), location.origin).searchParams.get("v") === videoId; }
      catch { return false; }
    });
  }

  function cancel() {
    cancelAnimationFrame(frame);
    clearTimeout(settleTimer);
    frame = settleTimer = null;
    document.removeEventListener("wheel", manual, true);
    document.removeEventListener("pointerdown", manual, true);
    document.removeEventListener("keydown", onKey, true);
  }

  function reveal(videoId) {
    if (document.querySelector(".tubeorder-history-open")) return;
    if (!videoId || videoKey() !== videoId || document.getElementById("tubeorder-lock")) return;
    const renderer = panel();
    if (!renderer) return;
    const row = currentRow(renderer, videoId);
    if (!row) return;
    for (let viewport = row.parentElement; viewport && renderer.contains(viewport); viewport = viewport.parentElement) {
      if (!viewport.clientHeight || viewport.scrollHeight <= viewport.clientHeight || !/auto|scroll/.test(getComputedStyle(viewport).overflowY)) continue;
      const bounds = viewport.getBoundingClientRect();
      const item = row.getBoundingClientRect();
      const top = bounds.top + viewport.clientTop;
      const bottom = top + viewport.clientHeight;
      const delta = item.top < top || item.height > viewport.clientHeight
        ? item.top - top : item.bottom > bottom ? item.bottom - bottom : 0;
      // Scroll this viewport only; scrollIntoView can also move the whole page.
      if (Math.abs(delta) > 1) viewport.scrollTo({ top: viewport.scrollTop + delta, left: viewport.scrollLeft, behavior: "instant" });
      return;
    }
  }

  function schedule() {
    cancel();
    const videoId = videoKey();
    if (!videoId || document.getElementById("tubeorder-lock")) return;
    if (currentRow(panel(), videoId)) lastVideo = videoId;
    document.addEventListener("wheel", manual, { capture: true, passive: true });
    document.addEventListener("pointerdown", manual, { capture: true, passive: true });
    document.addEventListener("keydown", onKey, true);
    frame = requestAnimationFrame(() => { frame = null; reveal(videoId); });
    // YouTube also positions its queue after rendering. Check once more, then
    // remain idle; a manual scroll or a new navigation cancels this check.
    settleTimer = setTimeout(() => { reveal(videoId); cancel(); }, 400);
  }

  function ready() {
    const videoId = videoKey();
    if (videoId === lastVideo) return;
    if (videoId && !currentRow(panel(), videoId)) return;
    lastVideo = videoId;
    schedule();
  }

  function manual(event) {
    if (event.composedPath().includes(panel())) cancel();
  }

  function onKey(event) {
    if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) manual(event);
  }

  document.addEventListener("yt-navigate-start", () => { lastVideo = null; cancel(); });
  document.addEventListener("yt-navigate-finish", ready);
  window.addEventListener("tubeorder:sidebar-ready", ready);
  window.addEventListener("tubeorder:removed-closed", schedule);
  window.addEventListener("tubeorder:sort-unlocked", schedule);
  ready();
})();
