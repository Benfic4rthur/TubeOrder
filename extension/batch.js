(function () {
  "use strict";
  if (globalThis.__tubeOrderBatchBridgeLoaded) return;
  globalThis.__tubeOrderBatchBridgeLoaded = true;

  const REQUEST_EVENT = "tubeorder:batch-request";
  const RESULT_EVENT = "tubeorder:batch-result";
  const CANCEL_EVENT = "tubeorder:batch-cancel";
  const BATCH_SIZE = 50;
  let activeJob = null;

  function eligible() {
    const url = new URL(location.href);
    const path = url.pathname.replace(/\/$/, "");
    if (url.origin !== "https://www.youtube.com" || !["/playlist", "/watch"].includes(path) || url.searchParams.get("list") !== "WL") return false;
    const avatar = document.querySelector("ytd-masthead #avatar-btn, #masthead #avatar-btn, ytd-masthead button#avatar");
    return Boolean(avatar && !avatar.closest("[hidden]"));
  }

  function visibleRows() {
    if (location.pathname.replace(/\/$/, "") === "/watch") {
      for (const panel of document.querySelectorAll("ytd-playlist-panel-renderer")) {
        if (panel.closest("[hidden]")) continue;
        return Array.from(panel.querySelectorAll("ytd-playlist-panel-video-renderer"));
      }
      return [];
    }
    for (const renderer of document.querySelectorAll("ytd-playlist-video-list-renderer")) {
      if (renderer.closest("[hidden]")) continue;
      const contents = renderer.querySelector(":scope > #contents") || renderer.querySelector("#contents");
      if (contents) return Array.from(contents.children).filter((row) => row.matches("ytd-playlist-video-renderer"));
    }
    return [];
  }

  function rowData(row) {
    return row.data || row.polymerController?.data || row.inst?.data || null;
  }

  function videoId(row) {
    const data = rowData(row);
    if (typeof data?.videoId === "string" && data.videoId) return data.videoId;
    const link = row.querySelector("a#video-title, a[href*='/watch?'], a[href*='watch?v=']");
    try { return new URL(link?.getAttribute("href"), location.origin).searchParams.get("v"); } catch { return null; }
  }

  function sameOrder(a, b) {
    return a.length === b.length && a.every((id, index) => id === b[index]);
  }

  function emit(requestId, payload) {
    window.dispatchEvent(new CustomEvent(RESULT_EVENT, { detail: { requestId, ...payload } }));
  }

  function nativeEndpoint(rows) {
    for (const row of rows) {
      const items = rowData(row)?.menu?.menuRenderer?.items;
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        const endpoint = item.menuServiceItemRenderer?.serviceEndpoint;
        const edit = endpoint?.playlistEditEndpoint;
        const metadata = endpoint?.commandMetadata?.webCommandMetadata;
        if (edit?.playlistId !== "WL" || (metadata?.apiUrl && metadata.apiUrl !== "/youtubei/v1/browse/edit_playlist")) continue;
        if (!Array.isArray(edit.actions) || !edit.actions.some((action) => action.action === "ACTION_MOVE_VIDEO_AFTER" && !action.movedSetVideoIdPredecessor)) continue;
        const cloned = JSON.parse(JSON.stringify(endpoint));
        delete cloned.clientActions;
        delete cloned.playlistEditEndpoint.clientActions;
        return cloned;
      }
    }
    // The playback sidebar does not always expose the move-to-top menu. This
    // is the same endpoint used by YouTube's own playlist queue manager.
    if (location.pathname.replace(/\/$/, "") === "/watch" && rows.length) {
      return {
        commandMetadata: { webCommandMetadata: { sendPost: true, apiUrl: "/youtubei/v1/browse/edit_playlist" } },
        playlistEditEndpoint: { playlistId: "WL", actions: [] },
      };
    }
    return null;
  }

  function nativeWatchContext(rows, currentIds) {
    const panel = rows[0]?.closest("ytd-playlist-panel-renderer");
    const controller = panel?.polymerController || panel;
    if (!panel || typeof controller?.handleDrop !== "function") return null;
    const parent = rows[0]?.parentNode;
    // YouTube's drop handler indexes raw childNodes and reads the previous
    // node's data, so a template/whitespace node before a row is unsupported.
    if (!parent || rows.some((row, index) => row.parentNode !== parent || parent.childNodes[index] !== row)) return null;
    const namespace = window.default_kevlar_base;
    if (!namespace) return null;
    const source = Function.prototype.toString.call(controller.handleDrop);
    const getter = source.match(/([\w$]+)=_\.([\w$]+)\(\);if\(\1\.responsePlaylistData/)?.[2] || "dg";
    if (typeof namespace[getter] !== "function") return null;
    const manager = namespace[getter]();
    const proxy = manager?.playlistProxy || manager?.queueProxy;
    const contents = manager?.responsePlaylistData?.contents;
    if (!proxy || !Array.isArray(proxy.pendingUpdates) || !Array.isArray(contents)) return null;
    if ((manager.listId && manager.listId !== "WL") || (proxy.listId && proxy.listId !== "WL")) return null;
    if (proxy.currentUpdateRequest || proxy.currentRefreshRequest || proxy.currentCreateRequest || proxy.pendingUpdates.length) return null;
    const managerIds = contents.filter((item) => item.playlistPanelVideoRenderer).map((item) => item.playlistPanelVideoRenderer.videoId);
    if (!sameOrder(managerIds, currentIds)) return null;
    if (Array.isArray(proxy.videoIds) && !sameOrder(proxy.videoIds, currentIds)) return null;
    return { panel, controller, manager, proxy, parent };
  }

  // Preflight every ID and simulate every move before touching the account.
  function prepare(request) {
    if (!eligible() || !Array.isArray(request.currentIds) || !Array.isArray(request.targetIds) || !Array.isArray(request.moves)) return null;
    const current = request.currentIds;
    const target = request.targetIds;
    if (!current.every((id) => typeof id === "string" && id) || !target.every((id) => typeof id === "string" && id)) return null;
    const ids = new Set(current);
    if (ids.size !== current.length || target.length !== current.length || new Set(target).size !== target.length || target.some((id) => !ids.has(id))) return null;
    const rows = visibleRows();
    if (!sameOrder(rows.map(videoId), current)) return null;
    const entries = new Map();
    const setIds = new Set();
    for (const row of rows) {
      const id = videoId(row);
      const data = rowData(row);
      const setVideoId = data?.setVideoId || data?.playlistSetVideoId;
      if (!id || typeof setVideoId !== "string" || !setVideoId || setIds.has(setVideoId)) return null;
      entries.set(id, setVideoId);
      setIds.add(setVideoId);
    }
    const watch = location.pathname.replace(/\/$/, "") === "/watch";
    const watchContext = watch ? nativeWatchContext(rows, current) : null;
    if (watch && !watchContext) return null;
    const endpoint = watch ? null : nativeEndpoint(rows);
    if (!watch && !endpoint) return null;
    const model = [...current];
    const actions = [];
    for (const move of request.moves) {
      if (!move || !entries.has(move.id) || !["top", "bottom"].includes(move.edge)) return null;
      const index = model.indexOf(move.id);
      if (index === -1) return null;
      model.splice(index, 1);
      const action = { action: "ACTION_MOVE_VIDEO_AFTER", setVideoId: entries.get(move.id) };
      if (move.edge === "bottom") {
        const predecessor = model[model.length - 1];
        if (predecessor) action.movedSetVideoIdPredecessor = entries.get(predecessor);
        model.push(move.id);
      } else model.unshift(move.id);
      actions.push(action);
    }
    if (!sameOrder(model, target)) return null;
    return { endpoint, actions, target: [...target], moves: request.moves.map((move) => ({ id: move.id, edge: move.edge })), watchContext };
  }

  async function nativeRequest(anchor, endpoint) {
    const detail = {
      actionName: "yt-service-request",
      optionalAction: false,
      args: [anchor, endpoint],
      returnValue: [],
    };
    anchor.dispatchEvent(new CustomEvent("yt-action", { bubbles: true, composed: true, detail }));
    const promise = detail.returnValue.find((value) => value?.ajaxPromise)?.ajaxPromise;
    if (!promise || typeof promise.then !== "function") throw new Error("O cliente do YouTube não confirmou o envio. Atualize a página e tente novamente.");
    let timer;
    try {
      return await Promise.race([
        Promise.resolve(promise),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("O YouTube demorou para confirmar o lote. Parte da ordem pode ter sido salva; atualize a página antes de tentar novamente.")), 20000);
        }),
      ]);
    } finally { clearTimeout(timer); }
  }

  async function waitForNativeOrder(target) {
    const deadline = performance.now() + 1000;
    while (true) {
      if (sameOrder(visibleRows().map(videoId), target)) return true;
      if (performance.now() >= deadline) return false;
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  }

  async function nativeWatchPromise(promise, deadline) {
    let timer;
    try {
      return await Promise.race([
        Promise.resolve(promise),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("O YouTube demorou para confirmar a fila. Parte da ordem pode ter sido salva; tente novamente quando a conexão normalizar.")), Math.max(1, deadline - performance.now()));
        }),
      ]);
    } finally { clearTimeout(timer); }
  }

  async function runWatch(job, prepared, started) {
    const { controller, manager, proxy, parent } = prepared.watchContext;
    const total = prepared.moves.length;
    const deadline = performance.now() + 25000;
    // The native handler updates account order, sidebar and autoplay together.
    // Keep this loop synchronous: the first edit goes immediately and YouTube
    // automatically batches the remaining pending edits into its next request.
    for (const move of prepared.moves) {
      if (job.cancelled || !eligible()) {
        if (!job.moved) return false;
        break;
      }
      const rows = visibleRows();
      const row = rows.find((candidate) => videoId(candidate) === move.id);
      if (!row || row.parentNode !== parent || rows.some((candidate, index) => parent.childNodes[index] !== candidate)) {
        throw new Error("O YouTube alterou a fila durante a organização. Os movimentos já enviados podem ter sido salvos.");
      }
      if (move.edge === "top") parent.insertBefore(row, rows[0]);
      else parent.insertBefore(row, rows[rows.length - 1].nextSibling);
      controller.handleDrop({ currDragItem: row });
      job.moved += 1;
    }
    emit(job.requestId, {
      type: "progress", moved: 0, queued: job.moved, total,
      elapsedMs: Math.max(1, performance.now() - started), etaSeconds: 3,
      pendingConfirmation: true,
      message: "Aguardando o YouTube confirmar a nova fila…",
    });
    let refreshedOrder = null;
    let sawRefresh = false;
    while (performance.now() < deadline) {
      const updateRequest = proxy.currentUpdateRequest;
      if (updateRequest && typeof updateRequest.then === "function") {
        await nativeWatchPromise(updateRequest, deadline);
        await new Promise((resolve) => setTimeout(resolve, 0));
        continue;
      }
      const refreshRequest = proxy.currentRefreshRequest;
      if (refreshRequest && typeof refreshRequest.then === "function") {
        const response = await nativeWatchPromise(refreshRequest, deadline);
        const freshContents = response?.playlistPanelRenderer?.contents;
        if (Array.isArray(freshContents)) {
          refreshedOrder = freshContents.filter((item) => item.playlistPanelVideoRenderer).map((item) => item.playlistPanelVideoRenderer.videoId);
        }
        sawRefresh = true;
        await new Promise((resolve) => setTimeout(resolve, 0));
        continue;
      }
      if (!proxy.pendingUpdates.length && sawRefresh) {
        const managerIds = manager.responsePlaylistData?.contents?.filter((item) => item.playlistPanelVideoRenderer).map((item) => item.playlistPanelVideoRenderer.videoId) || [];
        const target = prepared.target;
        if (refreshedOrder && !sameOrder(refreshedOrder, target)) throw new Error("O YouTube não confirmou a sequência salva. A reprodução foi mantida; tente organizar novamente.");
        const proxyMatches = !Array.isArray(proxy.videoIds) || sameOrder(proxy.videoIds, target);
        if (proxyMatches && sameOrder(managerIds, target) && sameOrder(visibleRows().map(videoId), target)) {
          if (job.cancelled || !eligible()) return false;
          const elapsedMs = Math.max(1, performance.now() - started);
          emit(job.requestId, { type: "progress", moved: job.moved, total, elapsedMs, etaSeconds: 0 });
          emit(job.requestId, {
            type: "done", moved: job.moved, total, elapsedMs, refreshRequired: false,
            secondsPerMove: job.moved ? elapsedMs / 1000 / job.moved : 0,
          });
          return true;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    throw new Error("O YouTube não concluiu a confirmação da fila. Os movimentos já enviados podem ter sido salvos; tente novamente.");
  }

  async function run(job, prepared) {
    const started = performance.now();
    let completedBatches = 0;
    const total = prepared.actions.length;
    const batches = Math.ceil(total / BATCH_SIZE);
    const onCancel = (event) => {
      if (event.detail?.requestId === job.requestId) job.cancelled = true;
    };
    window.addEventListener(CANCEL_EVENT, onCancel);
    try {
      if (prepared.watchContext) {
        if (!await runWatch(job, prepared, started)) emit(job.requestId, { type: "cancelled", moved: job.moved, total });
        return;
      }
      for (let offset = 0; offset < total; offset += BATCH_SIZE) {
        if (job.cancelled || !eligible()) {
          emit(job.requestId, { type: "cancelled", moved: job.moved, total });
          return;
        }
        const endpoint = JSON.parse(JSON.stringify(prepared.endpoint));
        endpoint.playlistEditEndpoint.actions = prepared.actions.slice(offset, offset + BATCH_SIZE);
        const anchor = visibleRows()[0];
        if (!anchor?.isConnected) throw new Error("O YouTube alterou a página durante a organização. Atualize a playlist para verificar os movimentos já salvos.");
        // Let YouTube handle its own account, authentication, request and UI updates.
        const response = await nativeRequest(anchor, endpoint);
        const result = response?.data || response;
        if (result?.status !== "STATUS_SUCCEEDED") throw new Error("O YouTube não confirmou a gravação do lote. Os lotes anteriores continuam salvos; atualize a página antes de tentar novamente.");
        job.moved += endpoint.playlistEditEndpoint.actions.length;
        completedBatches += 1;
        const elapsedMs = Math.max(1, performance.now() - started);
        emit(job.requestId, {
          type: "progress", moved: job.moved, total, elapsedMs,
          etaSeconds: Math.ceil(elapsedMs / completedBatches * (batches - completedBatches) / 1000),
        });
      }
      if (job.cancelled || !eligible()) {
        emit(job.requestId, { type: "cancelled", moved: job.moved, total });
        return;
      }
      if (!await waitForNativeOrder(prepared.target)) {
        throw new Error("O YouTube recebeu os lotes, mas a página ainda não confirmou a sequência. Atualize a playlist para verificar a ordem salva.");
      }
      if (job.cancelled || !eligible()) {
        emit(job.requestId, { type: "cancelled", moved: job.moved, total });
        return;
      }
      const elapsedMs = Math.max(1, performance.now() - started);
      emit(job.requestId, {
        type: "done", moved: job.moved, total, elapsedMs,
        refreshRequired: false,
        secondsPerMove: job.moved ? elapsedMs / 1000 / job.moved : 0,
      });
    } catch (error) {
      emit(job.requestId, { type: "error", moved: job.moved, total, message: error?.message || "Não foi possível concluir os lotes. Atualize a página para verificar os movimentos salvos." });
    } finally {
      window.removeEventListener(CANCEL_EVENT, onCancel);
      if (activeJob === job) activeJob = null;
    }
  }

  window.addEventListener(REQUEST_EVENT, (event) => {
    const request = event.detail;
    if (!request || typeof request.requestId !== "string" || !request.requestId || request.requestId.length > 200) return;
    if (activeJob) {
      emit(request.requestId, { type: "error", moved: 0, message: "Já existe uma organização em andamento nesta página." });
      return;
    }
    let prepared;
    try { prepared = prepare(request); } catch { prepared = null; }
    if (!prepared) {
      emit(request.requestId, { type: "unsupported" });
      return;
    }
    const job = { requestId: request.requestId, cancelled: false, moved: 0 };
    activeJob = job;
    emit(request.requestId, { type: "started", moved: 0, total: prepared.actions.length });
    void run(job, prepared);
  });
})();
