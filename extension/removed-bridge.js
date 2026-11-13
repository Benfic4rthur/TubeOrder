(function () {
  "use strict";
  if (globalThis.__tubeOrderRemovedBridgeLoaded) return;
  globalThis.__tubeOrderRemovedBridgeLoaded = true;
  const rowData = row => row?.data || row?.polymerController?.data || row?.inst?.data;
  const text = value => typeof value === "string" ? value : value?.simpleText || value?.runs?.map(run => run.text).join("") || "";
  const observed = new WeakSet(), restoring = new Set();
  let identity = null, keyPromise = null;
  function context() {
    const url = new URL(location.href), avatar = document.querySelector("ytd-masthead #avatar-btn, #masthead #avatar-btn");
    return url.origin === "https://www.youtube.com" && ["/watch", "/playlist"].includes(url.pathname) && url.searchParams.get("list") === "WL" && avatar && !avatar.closest("[hidden]");
  }
  function sourceIdentity() {
    try { return ["DATASYNC_ID", "DELEGATED_SESSION_ID", "CHANNEL_ID"].map(key => window.ytcfg?.get(key)).find(value => typeof value === "string" && value.length > 0) || null; }
    catch { return null; }
  }
  function accountKey() {
    const current = sourceIdentity();
    if (!current || !context()) return Promise.resolve(null);
    if (identity !== current || !keyPromise) {
      identity = current;
      keyPromise = crypto.subtle.digest("SHA-256", new TextEncoder().encode(`tubeorder:${current}`)).then(bytes => [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join(""));
    }
    return keyPromise;
  }
  function rows() { return [...document.querySelectorAll("ytd-playlist-panel-renderer:not([hidden]) ytd-playlist-panel-video-renderer, ytd-playlist-video-list-renderer:not([hidden]) ytd-playlist-video-renderer")]; }
  function metadata(row) {
    const data = rowData(row), id = data?.videoId;
    if (typeof id !== "string" || !/^[\w-]{11}$/.test(id)) return null;
    return { id: crypto.randomUUID(), videoId: id, title: text(data.title) || row.querySelector("#video-title")?.textContent?.trim(),
      channel: text(data.shortBylineText || data.longBylineText || data.ownerText) || row.querySelector("#byline, ytd-channel-name, .fixture-channel-name")?.textContent?.trim(),
      duration: text(data.lengthText) || row.querySelector("ytd-thumbnail-overlay-time-status-renderer, .yt-badge-shape__text")?.textContent?.trim(),
      thumbnail: data.thumbnail?.thumbnails?.at(-1)?.url || row.querySelector("img")?.src, removedAt: Date.now() };
  }
  function publish(account, entries, phase) {
    void account.then(accountKey => { if (accountKey) window.dispatchEvent(new CustomEvent("tubeorder:removed-record", { detail: { accountKey, entries, phase } })); });
  }
  document.addEventListener("yt-action", event => {
    if (!context() || event.detail?.actionName !== "yt-service-request") return;
    const endpoint = event.detail.args?.[1], edit = endpoint?.playlistEditEndpoint;
    if (endpoint?.commandMetadata?.webCommandMetadata?.apiUrl !== "/youtubei/v1/browse/edit_playlist" || edit?.playlistId !== "WL" || !Array.isArray(edit.actions) || !edit.actions.length || edit.actions.length > 50 ||
        edit.actions.some(action => action.action !== "ACTION_REMOVE_VIDEO")) return;
    const visible = rows();
    const entries = edit.actions.map(action => metadata(visible.find(row => (rowData(row)?.playlistSetVideoId || rowData(row)?.setVideoId) === action.setVideoId))).filter(Boolean);
    if (!entries.length) return;
    const account = accountKey();
    publish(account, entries, "pending");
    queueMicrotask(() => {
      const promise = event.detail.returnValue?.find(value => value?.ajaxPromise)?.ajaxPromise;
      if (!promise || typeof promise.then !== "function") { publish(account, entries, "failed"); return; }
      if (observed.has(promise)) { publish(account, entries, "failed"); return; }
      observed.add(promise);
      void Promise.resolve(promise).then(response => publish(account, entries, (response?.data || response)?.status === "STATUS_SUCCEEDED" ? "done" : "failed"), () => publish(account, entries, "failed"));
    });
  }, true);
  window.addEventListener("tubeorder:history-context-request", event => {
    const request = event.detail;
    if (!context() || typeof request?.requestId !== "string") return;
    void accountKey().then(accountKey => window.dispatchEvent(new CustomEvent("tubeorder:history-context", { detail: { requestId: request.requestId, accountKey } })));
  });
  function restored(detail) { window.dispatchEvent(new CustomEvent("tubeorder:restore-result", { detail })); }
  window.addEventListener("tubeorder:restore-request", event => {
    const request = event.detail;
    if (!request || typeof request.requestId !== "string" || !/^[\w-]{11}$/.test(request.videoId) || request.contextUrl !== location.href || !context()) return;
    if (restoring.has(request.videoId)) return;
    restoring.add(request.videoId);
    void (async () => {
      let timer;
      try {
        const source = sourceIdentity();
        if (!request.accountKey || await accountKey() !== request.accountKey || sourceIdentity() !== source || !context()) throw new Error("A conta mudou. Reabra Removidos antes de restaurar.");
        if (document.getElementById("tubeorder-lock")) throw new Error("Aguarde a organização terminar antes de restaurar.");
        // The player may retain a removed playing item. Check the saved list,
        // rather than treating that temporary playback queue as membership.
        const present = rows().some(row => rowData(row)?.videoId === request.videoId);
        if (present) { restored({ requestId: request.requestId, type: "done", alreadySaved: true, queueConfirmed: true }); return; }
        const anchor = document.querySelector("ytd-playlist-panel-renderer:not([hidden]), ytd-playlist-video-list-renderer:not([hidden])");
        if (!anchor) throw new Error("A lista não está disponível nesta aba.");
        const endpoint = { commandMetadata: { webCommandMetadata: { sendPost: true, apiUrl: "/youtubei/v1/browse/edit_playlist" } }, playlistEditEndpoint: { playlistId: "WL", actions: [{ action: "ACTION_ADD_VIDEO", addedVideoId: request.videoId }] } };
        const detail = { actionName: "yt-service-request", optionalAction: false, args: [anchor, endpoint], returnValue: [] };
        anchor.dispatchEvent(new CustomEvent("yt-action", { bubbles: true, composed: true, detail }));
        const native = detail.returnValue.find(value => value?.ajaxPromise);
        if (!native) throw new Error("O YouTube não confirmou o envio da restauração.");
        anchor.dispatchEvent(new CustomEvent("yt-service-request-sent", { bubbles: true, composed: true, detail: native }));
        const response = await Promise.race([Promise.resolve(native.ajaxPromise), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("O YouTube demorou para confirmar. O vídeo continua em Removidos.")), 20000); })]);
        if ((response?.data || response)?.status !== "STATUS_SUCCEEDED") throw new Error("O YouTube não confirmou a restauração. O vídeo continua em Removidos.");
        anchor.dispatchEvent(new CustomEvent("yt-service-request-completed", { bubbles: true, composed: true, detail: response }));
        restored({ requestId: request.requestId, type: "done", serverConfirmed: true });
      } catch (error) { restored({ requestId: request.requestId, type: "error", message: error.message }); }
      finally { clearTimeout(timer); restoring.delete(request.videoId); }
    })();
  });
})();
