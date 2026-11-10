(function () {
  "use strict";
  if (globalThis.__tubeOrderRemovalBridgeLoaded) return;
  globalThis.__tubeOrderRemovalBridgeLoaded = true;

  const REQUEST_EVENT = "tubeorder:remove-watched-request";
  const RESULT_EVENT = "tubeorder:remove-watched-result";
  const attempted = new Set();
  let active = null;
  let enabled = false;
  window.addEventListener("tubeorder:cleanup-settings", event => { enabled = event.detail?.enabled === true; });

  function emit(request, type, extra = {}) {
    window.dispatchEvent(new CustomEvent(RESULT_EVENT, {
      detail: { requestId: request.requestId, videoId: request.videoId, type, ...extra },
    }));
  }

  function watchLater() {
    const url = new URL(location.href);
    const avatar = document.querySelector("ytd-masthead #avatar-btn, #masthead #avatar-btn, ytd-masthead button#avatar");
    return url.origin === "https://www.youtube.com" && url.pathname.replace(/\/$/, "") === "/watch" &&
      url.searchParams.get("list") === "WL" && Boolean(avatar && !avatar.closest("[hidden]"));
  }

  function data(row) {
    return row.data || row.polymerController?.data || row.inst?.data || null;
  }

  function rows() {
    for (const panel of document.querySelectorAll("ytd-playlist-panel-renderer")) {
      if (!panel.closest("[hidden]")) return Array.from(panel.querySelectorAll("ytd-playlist-panel-video-renderer"));
    }
    return [];
  }

  function idsFromContents(contents) {
    if (!Array.isArray(contents)) return null;
    return contents.filter((item) => item.playlistPanelVideoRenderer).map((item) => item.playlistPanelVideoRenderer.videoId);
  }

  function sameOrder(a, b) {
    return Boolean(a && b && a.length === b.length && a.every((id, index) => id === b[index]));
  }

  function playingNext(nextVideoId) {
    if (!watchLater() || new URL(location.href).searchParams.get("v") !== nextVideoId) return false;
    const player = document.getElementById("movie_player");
    if (typeof player?.getVideoData !== "function" || typeof player?.getPlayerState !== "function") return false;
    const playerData = player.getVideoData();
    return (playerData?.video_id || playerData?.videoId) === nextVideoId && player.getPlayerState() === 1;
  }

  function removalEndpoint(row, setVideoId) {
    const items = data(row)?.menu?.menuRenderer?.items;
    if (!Array.isArray(items)) return null;
    for (const item of items) {
      const endpoint = item.menuServiceItemRenderer?.serviceEndpoint;
      const edit = endpoint?.playlistEditEndpoint;
      const apiUrl = endpoint?.commandMetadata?.webCommandMetadata?.apiUrl;
      if (edit?.playlistId !== "WL" || (apiUrl && apiUrl !== "/youtubei/v1/browse/edit_playlist")) continue;
      if (!Array.isArray(edit.actions) || edit.actions.length !== 1) continue;
      const action = edit.actions[0];
      if (action.action !== "ACTION_REMOVE_VIDEO" || action.setVideoId !== setVideoId) continue;
      // Preserve YouTube's native queue/autoplay update. Never invent a removal
      // command or let a client action remove any other playlist entry.
      if (!Array.isArray(edit.clientActions)) continue;
      let matches = false;
      let safe = true;
      for (const clientAction of edit.clientActions) {
        const removal = clientAction.playlistRemoveVideosAction;
        if (!removal) continue;
        if (!Array.isArray(removal.setVideoIds) || removal.setVideoIds.length !== 1 || removal.setVideoIds[0] !== setVideoId) safe = false;
        else matches = true;
      }
      if (safe && matches) return JSON.parse(JSON.stringify(endpoint));
    }
    return null;
  }

  function prepare(request) {
    if (!enabled || !playingNext(request.nextVideoId) || request.videoId === request.nextVideoId) return null;
    const visible = rows();
    const oldRow = visible.find((row) => data(row)?.videoId === request.videoId);
    const nextRow = visible.find((row) => data(row)?.videoId === request.nextVideoId);
    const oldData = oldRow && data(oldRow);
    if (!oldRow || !nextRow || oldData.selected || oldRow.hasAttribute("selected")) return null;
    const setVideoId = oldData.playlistSetVideoId || oldData.setVideoId;
    if (typeof setVideoId !== "string" || !setVideoId || (request.setVideoId && request.setVideoId !== setVideoId)) return null;
    const endpoint = removalEndpoint(oldRow, setVideoId);
    if (!endpoint) return null;
    const panel = oldRow.closest("ytd-playlist-panel-renderer");
    const controller = panel?.polymerController || panel;
    const namespace = window.default_kevlar_base;
    const source = typeof controller?.handleDrop === "function" ? Function.prototype.toString.call(controller.handleDrop) : "";
    const getter = source.match(/([\w$]+)=_\.([\w$]+)\(\);if\(\1\.responsePlaylistData/)?.[2] || "dg";
    if (typeof namespace?.[getter] !== "function") return null;
    const manager = namespace[getter]();
    if (!manager || (manager.listId && manager.listId !== "WL") || manager.responsePlaylistData?.playlistId !== "WL") return null;
    if (manager.response?.playingVideoId && manager.response.playingVideoId !== request.nextVideoId) return null;
    const proxy = manager.playlistProxy || manager.queueProxy;
    if (proxy?.currentUpdateRequest || proxy?.currentRefreshRequest || proxy?.pendingUpdates?.length) return null;
    const managerIds = idsFromContents(manager.responsePlaylistData.contents);
    const domIds = visible.map((row) => data(row)?.videoId);
    if (!managerIds || !managerIds.includes(request.videoId) || !managerIds.includes(request.nextVideoId) || new Set(domIds).size !== domIds.length) return null;
    const playbackManager = Object.values(manager).find((value) => value && typeof value.getPlaylistData === "function" && typeof value.setPlaylistData === "function");
    if (!playbackManager) return null;
    const playbackData = playbackManager.getPlaylistData();
    if (playbackData?.playlistId !== "WL") return null;
    const playbackIds = idsFromContents(playbackData.contents);
    if (!playbackIds?.includes(request.videoId) || !playbackIds.includes(request.nextVideoId)) return null;
    return {
      oldRow, endpoint, manager, playbackManager, setVideoId,
      expectedManager: managerIds.filter((id) => id !== request.videoId),
      expectedPlayback: playbackIds.filter((id) => id !== request.videoId),
      expectedDom: domIds.filter((id) => id !== request.videoId),
    };
  }

  async function sendNative(prepared) {
    const anchor = prepared.oldRow;
    const detail = {
      actionName: "yt-service-request", optionalAction: false,
      args: [anchor, prepared.endpoint], returnValue: [],
    };
    anchor.dispatchEvent(new CustomEvent("yt-action", { bubbles: true, composed: true, detail }));
    const nativeRequest = detail.returnValue.find((value) => value?.ajaxPromise);
    if (!nativeRequest || typeof nativeRequest.ajaxPromise.then !== "function") throw new Error("O YouTube não confirmou o envio da remoção. O vídeo não será enviado novamente automaticamente.");
    // Match the event emitted by YouTube's own service-request wrapper.
    anchor.dispatchEvent(new CustomEvent("yt-service-request-sent", { bubbles: true, composed: true, detail: nativeRequest }));
    let timeout;
    try {
      const response = await Promise.race([
        Promise.resolve(nativeRequest.ajaxPromise),
        new Promise((_, reject) => {
          timeout = setTimeout(() => reject(new Error("O YouTube demorou para confirmar a remoção. Não vou tentar novamente automaticamente.")), 20000);
        }),
      ]);
      const result = response?.data || response;
      if (result?.status !== "STATUS_SUCCEEDED") throw new Error("O YouTube não confirmou a remoção. Não vou tentar novamente automaticamente.");
      anchor.dispatchEvent(new CustomEvent("yt-service-request-completed", { bubbles: true, composed: true, detail: response }));
      return response;
    } finally { clearTimeout(timeout); }
  }

  async function confirmQueue(prepared) {
    const deadline = performance.now() + 2000;
    while (performance.now() < deadline) {
      const managerIds = idsFromContents(prepared.manager.responsePlaylistData?.contents);
      const playbackIds = idsFromContents(prepared.playbackManager.getPlaylistData()?.contents);
      const domIds = rows().map((row) => data(row)?.videoId);
      if (sameOrder(managerIds, prepared.expectedManager) && sameOrder(playbackIds, prepared.expectedPlayback) && sameOrder(domIds, prepared.expectedDom)) return true;
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    return false;
  }

  async function run(request, prepared) {
    try {
      // A final current-player check closes the gap between preflight and send.
      if (!enabled || !playingNext(request.nextVideoId)) {
        emit(request, "unsupported");
        return;
      }
      attempted.add(prepared.setVideoId);
      if (attempted.size > 64) attempted.delete(attempted.values().next().value);
      emit(request, "started");
      await sendNative(prepared);
      if (!await confirmQueue(prepared)) throw new Error("A remoção foi confirmada pelo YouTube, mas a fila ainda não foi atualizada. A reprodução foi mantida e não haverá uma nova tentativa automática.");
      emit(request, "done", { serverConfirmed: true, queueConfirmed: true });
    } catch (error) {
      emit(request, "error", { message: error?.message || "Não foi possível confirmar a remoção do vídeo assistido." });
    } finally {
      if (active === request) active = null;
    }
  }

  window.addEventListener(REQUEST_EVENT, (event) => {
    const request = event.detail;
    if (!request || typeof request.requestId !== "string" || !request.requestId || request.requestId.length > 200 ||
        typeof request.videoId !== "string" || !request.videoId || typeof request.nextVideoId !== "string" || !request.nextVideoId) return;
    const currentRow = rows().find((row) => data(row)?.videoId === request.videoId);
    const currentData = currentRow && data(currentRow);
    const attemptedSetId = request.setVideoId || currentData?.playlistSetVideoId || currentData?.setVideoId;
    if (attemptedSetId && attempted.has(attemptedSetId)) { emit(request, "duplicate"); return; }
    if (active) { emit(request, "busy"); return; }
    let prepared;
    try { prepared = prepare(request); } catch { prepared = null; }
    if (!prepared) { emit(request, "unsupported"); return; }
    active = request;
    void run(request, prepared);
  });
})();
