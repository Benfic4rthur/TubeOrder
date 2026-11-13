(function () {
  "use strict";
  if (globalThis.TubeOrderSaveContext) return;
  const CARDS = "yt-lockup-view-model, ytd-compact-video-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-rich-grid-media, ytd-playlist-video-renderer";
  const visible = element => element && !element.closest("[hidden], ytd-ad-slot-renderer, ytd-promoted-sparkles-web-renderer");
  function supported() {
    const current = new URL(location.href), path = current.pathname.replace(/\/$/, "") || "/";
    const videos = ["/", "/watch", "/results", "/playlist"].includes(path) ||
      /^\/(feed|channel|c|user|hashtag)\//.test(path) || /^\/@[^/]+/.test(path);
    // History entries are already watched by definition.
    return current.origin === "https://www.youtube.com" && videos && path !== "/feed/history";
  }
  function available(url) {
    const avatar = document.querySelector("ytd-masthead #avatar-btn, #masthead #avatar-btn, ytd-masthead button#avatar");
    return (!url || url === location.href) && supported() && Boolean(visible(avatar));
  }
  function root() {
    const path = location.pathname.replace(/\/$/, "");
    const selector = path === "/watch" ? "#related, ytd-watch-next-secondary-results-renderer" :
      path === "/results" ? "ytd-search" : path === "/playlist" ? "ytd-playlist-video-list-renderer" : "ytd-browse";
    return [...document.querySelectorAll(selector)].find(visible) || null;
  }
  globalThis.TubeOrderSaveContext = Object.freeze({ CARDS, supported, available, root });
})();
