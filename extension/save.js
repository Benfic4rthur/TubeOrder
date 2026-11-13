(function () {
  "use strict";
  if (globalThis.__tubeOrderSaveBridgeLoaded) return;
  globalThis.__tubeOrderSaveBridgeLoaded = true;

  const CARDS = "yt-lockup-view-model, ytd-compact-video-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-rich-grid-media, ytd-playlist-video-renderer";
  const visible = node => node && !node.closest("[hidden], ytd-ad-slot-renderer, ytd-promoted-sparkles-web-renderer");
  const keys = new WeakMap();
  const saved = new Set();
  const active = new Set();
  let account = null;
  const rowData = row => row?.data || row?.polymerController?.data || row?.inst?.data;

  function context(url) {
    const current = new URL(location.href), path = current.pathname.replace(/\/$/, "") || "/";
    const avatar = document.querySelector("ytd-masthead #avatar-btn, #masthead #avatar-btn, ytd-masthead button#avatar");
    const supported = ["/", "/watch", "/results", "/playlist"].includes(path) || /^\/(feed|channel|c|user|hashtag)\//.test(path) || /^\/@[^/]+/.test(path);
    return (!url || url === location.href) && current.origin === "https://www.youtube.com" && supported && path !== "/feed/history" && Boolean(visible(avatar));
  }
  function cards() {
    const path = location.pathname.replace(/\/$/, "");
    const selector = path === "/watch" ? "#related, ytd-watch-next-secondary-results-renderer" : path === "/results" ? "ytd-search" :
      path === "/playlist" ? "ytd-playlist-video-list-renderer" : "ytd-browse";
    const root = [...document.querySelectorAll(selector)].find(visible);
    return [...(root?.querySelectorAll(CARDS) || [])].filter(card => visible(card) && !card.querySelector(CARDS));
  }
  function accountIdentity() {
    try { return window.ytcfg?.get("DATASYNC_ID") || window.ytcfg?.get("DELEGATED_SESSION_ID") || null; }
    catch { return null; }
  }

  function model(card) {
    try {
      const value = card.componentProps?.data || card.rawProps?.data;
      return (typeof value === "function" ? value() : value) || rowData(card) || null;
    } catch { return null; }
  }

  function idFor(card, value = model(card)) {
    if (value?.contentType && value.contentType !== "LOCKUP_CONTENT_TYPE_VIDEO") return null;
    const id = value?.contentId || value?.videoId;
    if (typeof id === "string" && /^[\w-]{11}$/.test(id)) return id;
    try { return new URL(card.querySelector("a[href*='watch?']")?.getAttribute("href"), location.origin).searchParams.get("v"); }
    catch { return null; }
  }

  function membership() {
    const identity = accountIdentity();
    if (identity !== account) { saved.clear(); account = identity; }
    const ids = new Set(saved);
    const watchLater = new URL(location.href).searchParams.get("list") === "WL";
    if (watchLater) for (const panel of document.querySelectorAll("ytd-playlist-panel-renderer:not([hidden]), ytd-playlist-video-list-renderer:not([hidden])")) {
      if (panel.closest("[hidden]")) continue;
      for (const row of panel.querySelectorAll("ytd-playlist-panel-video-renderer, ytd-playlist-video-renderer")) {
        const id = rowData(row)?.videoId || idFor(row);
        if (id) ids.add(id);
      }
    }
    try {
      const playlist = watchLater && document.getElementById("movie_player")?.getPlaylist?.();
      if (Array.isArray(playlist)) for (const id of playlist) if (typeof id === "string") ids.add(id);
    } catch { /* Visible rows and native per-card saved state still apply. */ }
    return ids;
  }

  function inspect(card, members) {
    const value = model(card), id = idFor(card, value);
    let endpoint = null, watched = false, alreadySaved = members.has(id);
    const seen = new WeakSet();
    let count = 0;
    function walk(node, depth = 0) {
      if (!node || typeof node !== "object" || seen.has(node) || depth > 26 || ++count > 6000) return;
      seen.add(node);
      if (node.isWatched === true || node.watched === true || Number(node.percentDurationWatched) > 0 ||
          Number(node.resumePositionSeconds) > 0 || Number(node.thumbnailOverlayProgressBarViewModel?.startPercent) > 0) watched = true;
      const status = node.thumbnailOverlayPlaybackStatusRenderer?.text;
      const label = status?.simpleText || status?.runs?.map(run => run.text).join("") || "";
      if (/^(assistido|watched)$/i.test(label.trim())) watched = true;
      const toggle = node.thumbnailOverlayToggleButtonRenderer;
      if (toggle) {
        if (toggle.untoggledServiceEndpoint?.playlistEditEndpoint?.playlistId === "WL") {
          if (toggle.isToggled === true) alreadySaved = true;
          else walk(toggle.untoggledServiceEndpoint, depth + 1);
        }
        // The unused REMOVE endpoint of an untoggled native button is not a saved-state signal.
        return;
      }
      const edit = node.playlistEditEndpoint;
      if (edit?.playlistId === "WL" && Array.isArray(edit.actions) && edit.actions.length === 1) {
        const action = edit.actions[0];
        if (action.action === "ACTION_REMOVE_VIDEO") alreadySaved = true;
        if (action.action === "ACTION_ADD_VIDEO" && action.addedVideoId === id &&
            node.commandMetadata?.webCommandMetadata?.apiUrl === "/youtubei/v1/browse/edit_playlist" &&
            !edit.clientActions?.length) endpoint = node;
      }
      for (const child of Object.values(node)) if (child && typeof child === "object") walk(child, depth + 1);
    }
    walk(value);
    for (const bar of card.querySelectorAll("ytd-thumbnail-overlay-resume-playback-renderer #progress, .ytThumbnailOverlayProgressBarHostWatchedProgressBarSegment, [role='progressbar']")) {
      if (parseFloat(bar.style.width) > 0 || Number(bar.getAttribute("aria-valuenow")) > 0) watched = true;
    }
    return { id, eligible: Boolean(id && endpoint && !watched && !alreadySaved), endpoint };
  }

  function emit(detail) {
    window.dispatchEvent(new CustomEvent("tubeorder:save-result", { detail }));
  }

  window.addEventListener("tubeorder:recommendations-scan", event => {
    const request = event.detail;
    if (typeof request?.requestId !== "string" || !context(request.contextUrl)) return;
    const members = membership();
    const items = cards().map(card => {
      if (!keys.has(card)) keys.set(card, crypto.randomUUID());
      const key = keys.get(card);
      card.setAttribute("data-tubeorder-save-key", key);
      const info = inspect(card, members);
      return { key, videoId: info.id, eligible: info.eligible };
    });
    window.dispatchEvent(new CustomEvent("tubeorder:recommendations-state", { detail: { requestId: request.requestId, items } }));
  });

  async function run(request, card, endpoint) {
    let timeout;
    const identity = accountIdentity();
    try {
      if (!context(request.contextUrl) || document.getElementById("tubeorder-lock")) throw new Error("A página está organizando ou mudou. Tente salvar novamente depois.");
      const detail = { actionName: "yt-service-request", optionalAction: false, args: [card, endpoint], returnValue: [] };
      card.dispatchEvent(new CustomEvent("yt-action", { bubbles: true, composed: true, detail }));
      const native = detail.returnValue.find(value => value?.ajaxPromise && typeof value.ajaxPromise.then === "function");
      if (!native) throw new Error("O YouTube não disponibilizou o envio. Nenhuma inclusão foi confirmada.");
      card.dispatchEvent(new CustomEvent("yt-service-request-sent", { bubbles: true, composed: true, detail: native }));
      const response = await Promise.race([
        Promise.resolve(native.ajaxPromise),
        new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error("O YouTube demorou para confirmar. Confira sua lista antes de tentar novamente.")), 20000); }),
      ]);
      if ((response?.data || response)?.status !== "STATUS_SUCCEEDED") throw new Error("O YouTube não confirmou a inclusão. Tente novamente quando quiser.");
      if (identity === accountIdentity()) saved.add(request.videoId);
      // Keep only a small session cache; the playlist and native renderer remain authoritative.
      if (saved.size > 256) saved.delete(saved.values().next().value);
      card.dispatchEvent(new CustomEvent("yt-service-request-completed", { bubbles: true, composed: true, detail: response }));
      emit({ requestId: request.requestId, videoId: request.videoId, type: "done", serverConfirmed: true });
    } catch (error) {
      emit({ requestId: request.requestId, videoId: request.videoId, type: "error", message: error.message || "Não consegui confirmar a inclusão." });
    } finally { clearTimeout(timeout); active.delete(request.videoId); }
  }

  window.addEventListener("tubeorder:save-request", event => {
    const request = event.detail;
    if (typeof request?.requestId !== "string" || request.requestId.length > 100 || typeof request.key !== "string" ||
        typeof request.videoId !== "string" || !/^[\w-]{11}$/.test(request.videoId) || !context(request.contextUrl)) return;
    if (active.has(request.videoId)) { emit({ ...request, type: "error", message: "Este vídeo já está sendo salvo. Aguarde a confirmação." }); return; }
    const card = cards().find(node => keys.get(node) === request.key);
    const info = card?.isConnected && !card.closest("[hidden], ytd-ad-slot-renderer") ? inspect(card, membership()) : null;
    if (!info?.eligible || info.id !== request.videoId) {
      emit({ requestId: request.requestId, videoId: request.videoId, type: "error", message: "O vídeo já está salvo, foi assistido ou mudou. Nenhum pedido de inclusão foi enviado." });
      return;
    }
    active.add(request.videoId);
    void run(request, card, JSON.parse(JSON.stringify(info.endpoint)));
  });

  for (const name of ["tubeorder:manual-remove-result", "tubeorder:remove-watched-result"]) {
    window.addEventListener(name, event => { if (event.detail?.type === "done" && event.detail.serverConfirmed) saved.delete(event.detail.videoId); });
  }
})();
