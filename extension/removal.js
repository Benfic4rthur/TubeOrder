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
    window.dispatchEvent(new CustomEvent(request.manual ? "tubeorder:manual-remove-result" : RESULT_EVENT, {
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
    if (location.pathname.replace(/\/$/, "") === "/playlist") {
      for (const list of document.querySelectorAll("ytd-playlist-video-list-renderer")) {
        if (!list.closest("[hidden]")) return Array.from(list.querySelectorAll("ytd-playlist-video-renderer"));
      }
      return [];
    }
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

  function queueSnapshot(read, request) {
    try {
      const ids = read();
      if (!Array.isArray(ids) || !ids.includes(request.videoId) || !ids.includes(request.nextVideoId) ||
          !ids.every(id => typeof id === "string" && id) || new Set(ids).size !== ids.length) return null;
      return { read, expected: ids.filter(id => id !== request.videoId) };
    } catch { return null; }
  }

  function confirmationQueues(panel, request) {
    const snapshots = [];
    const add = read => { const snapshot = queueSnapshot(read, request); if (snapshot) snapshots.push(snapshot); };
    const player = document.getElementById("movie_player");
    if (typeof player?.getPlaylist === "function") add(() => player.getPlaylist());
    // Private queue exports and cached response.playingVideoId vary between
    // YouTube builds. They provide extra confirmation, never permission to
    // remove an item. The current URL, player and native endpoint are checked
    // separately; use any available queue only if it contains both identities.
    try {
      const controller = panel?.polymerController || panel;
      const source = typeof controller?.handleDrop === "function" ? Function.prototype.toString.call(controller.handleDrop) : "";
      const getter = source.match(/([\w$]+)=_\.([\w$]+)\(\);if\(\1\.responsePlaylistData/)?.[2] || "dg";
      const namespace = window.default_kevlar_base;
      const manager = typeof namespace?.[getter] === "function" ? namespace[getter]() : null;
      if (manager?.listId === "WL" || manager?.responsePlaylistData?.playlistId === "WL") {
        add(() => idsFromContents(manager.responsePlaylistData?.contents));
        const playbackManager = Object.values(manager).find(value => value && typeof value.getPlaylistData === "function");
        if (playbackManager) add(() => idsFromContents(playbackManager.getPlaylistData()?.contents));
      }
    } catch { /* Native endpoint and visible queue do not require private exports. */ }
    return snapshots;
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
    if (!enabled || !playingNext(request.nextVideoId) || request.videoId === request.nextVideoId) {
      throw new Error("O vídeo foi mantido porque a reprodução mudou antes da remoção.");
    }
    const visible = rows();
    const oldRow = visible.find((row) => data(row)?.videoId === request.videoId);
    const nextRow = visible.find((row) => data(row)?.videoId === request.nextVideoId);
    const oldData = oldRow && data(oldRow);
    // After an in-place reorder, selected attributes may lag behind playback.
    // playingNext already confirms the current identity with both URL and player.
    if (!oldRow || !nextRow) {
      throw new Error("A fila mudou antes da remoção. O vídeo anterior foi mantido.");
    }
    const setVideoId = oldData.playlistSetVideoId || oldData.setVideoId;
    if (typeof setVideoId !== "string" || !setVideoId || (request.setVideoId && request.setVideoId !== setVideoId)) {
      throw new Error("Não consegui confirmar o item anterior na playlist. Ele foi mantido.");
    }
    const endpoint = removalEndpoint(oldRow, setVideoId);
    if (!endpoint) throw new Error("O YouTube não disponibilizou um comando de remoção válido para este item. O vídeo foi mantido.");
    const panel = oldRow.closest("ytd-playlist-panel-renderer");
    if (data(panel)?.playlistId && data(panel).playlistId !== "WL") throw new Error("A playlist mudou. Nenhum pedido de remoção foi enviado.");
    const domIds = visible.map((row) => data(row)?.videoId);
    if (!domIds.every(id => typeof id === "string" && id) || new Set(domIds).size !== domIds.length) throw new Error("Não consegui confirmar os itens da fila. O vídeo foi mantido.");
    return {
      oldRow, endpoint, setVideoId, queues: confirmationQueues(panel, request),
      expectedDom: domIds.filter((id) => id !== request.videoId),
    };
  }

  function manualContext(request) {
    const url = new URL(location.href);
    const avatar = document.querySelector("ytd-masthead #avatar-btn, #masthead #avatar-btn, ytd-masthead button#avatar");
    return request.contextUrl === location.href && url.origin === "https://www.youtube.com" &&
      ["/watch", "/playlist"].includes(url.pathname.replace(/\/$/, "")) && url.searchParams.get("list") === "WL" &&
      Boolean(avatar && !avatar.closest("[hidden]")) && !document.getElementById("tubeorder-lock");
  }

  function prepareManual(request) {
    if (!manualContext(request)) throw new Error("A página mudou. Nenhum pedido de remoção foi enviado.");
    const visible = rows();
    const oldRow = visible.find(row => data(row)?.videoId === request.videoId);
    const setVideoId = oldRow && (data(oldRow)?.playlistSetVideoId || data(oldRow)?.setVideoId);
    const endpoint = oldRow && removalEndpoint(oldRow, setVideoId);
    if (!setVideoId || !endpoint) throw new Error("O YouTube não disponibilizou um comando de remoção válido para este item. Ele foi mantido.");
    const domIds = visible.map(row => data(row)?.videoId);
    if (!domIds.every(id => typeof id === "string" && id) || new Set(domIds).size !== domIds.length) throw new Error("Não consegui confirmar os itens da lista. Nenhum pedido foi enviado.");
    const panel = oldRow.closest("ytd-playlist-panel-renderer");
    const currentVideo = new URL(location.href).searchParams.get("v");
    // Removing the playing item is an explicit user action. YouTube may retain
    // that media as a temporary playback item; verify the saved/visible list.
    const queues = panel && currentVideo !== request.videoId
      ? confirmationQueues(panel, { ...request, nextVideoId: currentVideo }) : [];
    return { oldRow, endpoint, setVideoId, queues, expectedDom: domIds.filter(id => id !== request.videoId) };
  }

  async function sendNative(prepared) {
    const anchor = prepared.oldRow;
    const detail = {
      actionName: "yt-service-request", optionalAction: false,
      args: [anchor, prepared.endpoint], returnValue: [],
    };
    const archive = globalThis.TubeOrderRemovedBridge;
    const record = archive?.begin(anchor, detail);
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
      if (result?.status !== "STATUS_SUCCEEDED") {
        archive?.settle(record, "failed");
        throw new Error("O YouTube não confirmou a remoção. Não vou tentar novamente automaticamente.");
      }
      // Save on server acknowledgement, before waiting for the playback queue.
      archive?.settle(record, "done");
      anchor.dispatchEvent(new CustomEvent("yt-service-request-completed", { bubbles: true, composed: true, detail: response }));
      return response;
    } finally { clearTimeout(timeout); }
  }

  async function confirmQueue(prepared) {
    const deadline = performance.now() + 2000;
    while (performance.now() < deadline) {
      const domIds = rows().map((row) => data(row)?.videoId);
      if (sameOrder(domIds, prepared.expectedDom) && prepared.queues.every(queue => {
        try { return sameOrder(queue.read(), queue.expected); } catch { return false; }
      })) return true;
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    return false;
  }

  async function run(request, prepared) {
    try {
      // A final current-player check closes the gap between preflight and send.
      if (request.manual ? !manualContext(request) : !enabled || !playingNext(request.nextVideoId)) {
        emit(request, "unsupported");
        return;
      }
      attempted.add(request.requestId);
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
    if (attempted.has(request.requestId)) { emit(request, "duplicate"); return; }
    if (active) { emit(request, "busy"); return; }
    let prepared;
    try { prepared = prepare(request); }
    catch (error) { emit(request, "unsupported", { message: error?.message || "Não consegui confirmar a remoção do vídeo anterior." }); return; }
    active = request;
    void run(request, prepared);
  });

  window.addEventListener("tubeorder:manual-remove-request", event => {
    const detail = event.detail;
    if (!detail || typeof detail.requestId !== "string" || !detail.requestId || detail.requestId.length > 200 ||
        typeof detail.videoId !== "string" || !detail.videoId || typeof detail.contextUrl !== "string") return;
    const request = { requestId: detail.requestId, videoId: detail.videoId, contextUrl: detail.contextUrl, manual: true };
    if (active) { emit(request, "busy", { message: "Já existe uma remoção em andamento. Aguarde a confirmação." }); return; }
    let prepared;
    try { prepared = prepareManual(request); }
    catch (error) { emit(request, "unsupported", { message: error?.message || "Não consegui confirmar o item da lista." }); return; }
    active = request;
    void run(request, prepared);
  });
})();
