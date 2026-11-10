(function () {
  "use strict";
  if (globalThis.__tubeOrderCleanupLoaded) return;
  globalThis.__tubeOrderCleanupLoaded = true;

  const STABLE_MS = 350;
  const NOTICE_MS = 6000;
  const TRANSITION_MS = 90000;
  const epochs = new WeakMap();
  const mediaHistory = new WeakMap();
  const attempted = new Set();
  let enabled = false, session = null, pending = null, inFlight = null;
  let expiryTimer, noticeTimer, stableTimer, resultTimer;
  let noticeHost, noticeView, resultHost, resultView;

  const rowData = row => row?.data || row?.polymerController?.data || null;
  const panelRows = panel => Array.from(panel.querySelectorAll("ytd-playlist-panel-video-renderer"));

  function context() {
    const url = new URL(location.href);
    if (url.origin !== "https://www.youtube.com" || url.pathname.replace(/\/$/, "") !== "/watch" || url.searchParams.get("list") !== "WL") return null;
    const avatar = document.querySelector("ytd-masthead #avatar-btn, #masthead #avatar-btn, ytd-masthead button#avatar");
    if (!avatar || avatar.closest("[hidden]")) return null;
    const panel = Array.from(document.querySelectorAll("ytd-playlist-panel-renderer")).find(node => !node.closest("[hidden]"));
    if (!panel || (rowData(panel)?.playlistId && rowData(panel).playlistId !== "WL")) return null;
    const player = document.getElementById("movie_player");
    if (!player || player.classList.contains("ad-showing") || player.classList.contains("ad-interrupting")) return null;
    const media = player.querySelector("video.html5-main-video, video");
    let videoData;
    try { videoData = player.getVideoData?.(); } catch { return null; }
    const videoId = videoData?.video_id || videoData?.videoId;
    return media && videoId && !videoData.isLive ? { url, player, media, panel, videoId, videoData } : null;
  }

  function durationFor(ctx, row) {
    const raw = Number(ctx.videoData.length_seconds || ctx.videoData.lengthSeconds || ctx.videoData.durationSeconds);
    if (Number.isFinite(raw) && raw > 0) return raw;
    const length = rowData(row)?.lengthText;
    const text = length?.simpleText || length?.runs?.map(run => run.text).join("") || row?.querySelector("ytd-thumbnail-overlay-time-status-renderer, .yt-badge-shape__text")?.textContent || "";
    const match = text.match(/(?:^|[^\d:])(\d+:\d{2}(?::\d{2})?)(?![\d:])/);
    return match ? match[1].split(":").map(Number).reduce((total, part) => total * 60 + part, 0) : null;
  }

  function rangesFor(media) {
    try { return Array.from({ length: media.played.length }, (_, i) => [media.played.start(i), media.played.end(i)]); }
    catch { return []; }
  }

  function coveredSeconds(ranges, duration) {
    let covered = 0, cursor = 0;
    for (const [rawStart, rawEnd] of [...ranges].sort((a, b) => a[0] - b[0])) {
      if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd)) return 0;
      const start = Math.max(0, Math.min(duration, rawStart));
      const end = Math.max(start, Math.min(duration, rawEnd));
      covered += Math.max(0, end - Math.max(cursor, start));
      cursor = Math.max(cursor, end);
    }
    return covered;
  }

  function detachTracking() {
    if (!session) return;
    session.media.removeEventListener("timeupdate", onTimeUpdate);
    mediaHistory.set(session.media, { videoId: session.videoId, source: session.source, epoch: session.epoch });
  }

  function ensureSession(ctx) {
    if (!ctx || ctx.url.searchParams.get("v") !== ctx.videoId) return null;
    const row = panelRows(ctx.panel).find(node => rowData(node)?.videoId === ctx.videoId);
    const setVideoId = rowData(row)?.playlistSetVideoId || rowData(row)?.setVideoId;
    const duration = durationFor(ctx, row);
    if (!setVideoId || !Number.isFinite(duration) || duration <= 0 || !Number.isFinite(ctx.media.duration) || Math.abs(ctx.media.duration - duration) > Math.max(1, duration * 0.002)) return null;
    const source = ctx.media.currentSrc || ctx.media.getAttribute("src") || "";
    const epoch = epochs.get(ctx.media) || 0;
    if (session?.videoId === ctx.videoId && session.media === ctx.media && session.source === source && session.epoch === epoch) return session;
    const previousSession = session?.videoId === ctx.videoId && session.setVideoId === setVideoId ? session : null;
    detachTracking();
    const previous = mediaHistory.get(ctx.media);
    // A reused MediaSource may still expose the preceding video's played ranges.
    // In that case count only continuous playback observed for the new identity.
    const inherited = previous && previous.videoId !== ctx.videoId && previous.source === source && previous.epoch === epoch && rangesFor(ctx.media).length > 0;
    session = { videoId: ctx.videoId, setVideoId, media: ctx.media, duration, source, epoch,
      percent: previousSession?.percent || 0, qualified: Boolean(previousSession?.qualified), transitioning: false, inherited: Boolean(inherited), observed: [],
      lastTime: ctx.media.currentTime, lastWall: performance.now(), lastCoverageRead: -Infinity };
    mediaHistory.set(ctx.media, { videoId: ctx.videoId, source, epoch });
    if (!session.qualified) {
      ctx.media.addEventListener("timeupdate", onTimeUpdate);
      measure(session, ctx);
    }
    return session;
  }

  function measure(current, ctx = context()) {
    if (!current || !ctx || ctx.videoId !== current.videoId || ctx.media !== current.media || current.transitioning || ctx.media.seeking) return;
    const source = ctx.media.currentSrc || ctx.media.getAttribute("src") || "";
    if (source !== current.source || (epochs.get(ctx.media) || 0) !== current.epoch) return;
    if (!Number.isFinite(ctx.media.duration) || Math.abs(ctx.media.duration - current.duration) > Math.max(1, current.duration * 0.002)) return;
    const watched = coveredSeconds(current.inherited ? current.observed : rangesFor(ctx.media), current.duration);
    current.percent = Math.min(100, watched / current.duration * 100);
    if (watched + Math.min(0.5, current.duration * 0.001) >= current.duration * 0.8) {
      current.qualified = true;
      current.media.removeEventListener("timeupdate", onTimeUpdate);
    }
  }

  function onTimeUpdate(event) {
    const current = session;
    if (!enabled || !current || event.target !== current.media || current.transitioning || current.qualified) return;
    const now = performance.now();
    if (!current.inherited && (current.media.currentTime < current.duration * 0.75 || now - current.lastCoverageRead < 1000)) return;
    const ctx = context();
    if (!ctx || ctx.videoId !== current.videoId || ctx.media !== current.media) return;
    if (current.inherited) {
      const time = ctx.media.currentTime, delta = time - current.lastTime;
      const wall = Math.max(0, (now - current.lastWall) / 1000);
      if (!ctx.media.paused && !ctx.media.seeking && delta > 0 && delta <= wall * Math.abs(ctx.media.playbackRate || 1) + 0.25) {
        const previous = current.observed.at(-1);
        if (previous && current.lastTime >= previous[0] && current.lastTime <= previous[1] + 0.01) previous[1] = Math.max(previous[1], time);
        else current.observed.push([current.lastTime, time]);
      }
      current.lastTime = time;
      current.lastWall = now;
    }
    current.lastCoverageRead = now;
    measure(current, ctx);
  }

  function hideNotice() {
    clearTimeout(noticeTimer); clearTimeout(stableTimer);
    noticeTimer = stableTimer = null;
    noticeView?.destroy(); noticeHost?.remove();
    noticeView = noticeHost = null;
    if (pending) pending.deadline = null;
  }

  function clearPending() {
    hideNotice(); clearTimeout(expiryTimer); expiryTimer = null; pending = null;
  }

  function clearResult() {
    clearTimeout(resultTimer); resultTimer = null;
    resultView?.destroy(); resultHost?.remove();
    resultView = resultHost = null;
  }

  function showResult(type, message, allowDisabled = false) {
    clearResult();
    if ((!enabled && !allowDisabled) || !context() || !globalThis.TubeOrderCleanupUI) return;
    resultHost = document.createElement("div"); resultHost.id = "tubeorder-cleanup-result";
    document.documentElement.appendChild(resultHost);
    resultView = globalThis.TubeOrderCleanupUI.mountResult(resultHost, { onDismiss: clearResult });
    resultView.update({ type, message });
    resultTimer = setTimeout(clearResult, 5000);
  }

  function keepVideo() {
    const preview = Boolean(pending?.preview);
    clearPending(); showResult("done", "Vídeo mantido no Assistir mais tarde.", preview);
  }

  function stagePrevious() {
    const current = session;
    if (!enabled || !current) return;
    measure(current); current.transitioning = true; detachTracking();
    if (pending?.videoId === current.videoId) return;
    clearPending();
    if (!current.qualified || attempted.has(current.setVideoId)) return;
    pending = { videoId: current.videoId, setVideoId: current.setVideoId,
      percent: Math.max(80, Math.round(current.percent)), nextVideoId: null, nextPlaying: false, deadline: null };
    expiryTimer = setTimeout(clearPending, TRANSITION_MS);
  }

  function nextIsPlaying(candidate, ctx = context()) {
    if (candidate.preview) return ctx && ctx.videoId === candidate.nextVideoId && ctx.url.searchParams.get("v") === ctx.videoId;
    return enabled && ctx && candidate.nextPlaying && candidate.nextVideoId && ctx.videoId === candidate.nextVideoId &&
      ctx.url.searchParams.get("v") === candidate.nextVideoId && ctx.videoId !== candidate.videoId &&
      !ctx.media.paused && !ctx.media.ended && !ctx.media.seeking && ctx.media.readyState >= 2 &&
      panelRows(ctx.panel).some(row => rowData(row)?.videoId === candidate.nextVideoId);
  }

  function commit(candidate) {
    // A live UI check is deliberately incapable of reaching the removal bridge,
    // including when its countdown expires before the tester clicks Cancel.
    if (candidate.preview) {
      clearPending();
      showResult("done", "Teste concluído. Nenhum vídeo foi removido.", true);
      return;
    }
    if (pending !== candidate || !nextIsPlaying(candidate) || document.getElementById("tubeorder-lock") || inFlight) { hideNotice(); return; }
    clearPending(); attempted.add(candidate.setVideoId);
    if (attempted.size > 64) attempted.delete(attempted.values().next().value);
    const requestId = crypto.randomUUID(); inFlight = requestId;
    window.dispatchEvent(new CustomEvent("tubeorder:remove-watched-request", { detail: {
      requestId, videoId: candidate.videoId, setVideoId: candidate.setVideoId, nextVideoId: candidate.nextVideoId,
    } }));
  }

  function tick(candidate) {
    noticeTimer = null;
    if (pending !== candidate || !nextIsPlaying(candidate) || document.getElementById("tubeorder-lock")) { hideNotice(); return; }
    const remaining = candidate.deadline - performance.now();
    if (remaining <= 0) { commit(candidate); return; }
    noticeView?.update({ seconds: Math.ceil(remaining / 1000), percent: candidate.percent });
    noticeTimer = setTimeout(() => tick(candidate), Math.min(1000, remaining));
  }

  function maybeNotice() {
    if (!pending || stableTimer || noticeHost || inFlight || !nextIsPlaying(pending) || document.getElementById("tubeorder-lock")) return;
    const candidate = pending;
    stableTimer = setTimeout(() => {
      stableTimer = null;
      if (pending !== candidate || !nextIsPlaying(candidate) || document.getElementById("tubeorder-lock") || !globalThis.TubeOrderCleanupUI) return;
      clearResult(); noticeHost = document.createElement("div"); noticeHost.id = "tubeorder-cleanup-notice";
      document.documentElement.appendChild(noticeHost);
      noticeView = globalThis.TubeOrderCleanupUI.mountNotice(noticeHost, { onCancel: keepVideo });
      candidate.deadline = performance.now() + NOTICE_MS;
      tick(candidate);
    }, STABLE_MS);
  }

  function onEnded(event) {
    if (enabled && session && event.target === session.media) stagePrevious();
  }

  function onPlaying(event) {
    if (!enabled) return;
    const ctx = context();
    if (!ctx || event.target !== ctx.media) return;
    if (session && session.videoId !== ctx.videoId && !session.transitioning) stagePrevious();
    if (pending) {
      if (ctx.videoId === pending.videoId) clearPending();
      else {
        if (pending.nextVideoId && pending.nextVideoId !== ctx.videoId) clearPending();
        else { pending.nextVideoId = ctx.videoId; pending.nextPlaying = true; }
      }
    }
    const current = ensureSession(ctx);
    if (current) { current.transitioning = false; current.lastTime = ctx.media.currentTime; current.lastWall = performance.now(); }
    maybeNotice();
  }

  function onPause(event) {
    if (session && event.target === session.media) measure(session);
    const ctx = context();
    if (pending && ctx?.videoId === pending.nextVideoId && event.target === ctx.media) hideNotice();
  }

  function onResourceReset(event) {
    if (event.target instanceof HTMLVideoElement && event.target.closest("#movie_player")) epochs.set(event.target, (epochs.get(event.target) || 0) + 1);
  }

  function onSeek(event) {
    if (session && event.target === session.media) { session.lastTime = session.media.currentTime; session.lastWall = performance.now(); }
    if (noticeHost) hideNotice();
    if (event.type === "seeked") maybeNotice();
  }

  function onManualNext(event) {
    if (!session || !(event.target instanceof Element)) return;
    if (event.type === "keydown" && event.target.closest("input, textarea, [contenteditable='true']")) return;
    if (event.type === "click" && event.target.closest(".ytp-next-button, .ytp-prev-button, ytd-playlist-panel-video-renderer a[href], .ytp-suggestion-link")) stagePrevious();
    if (event.type === "keydown" && ((event.shiftKey && ["n", "p"].includes(event.key.toLowerCase())) || ["MediaTrackNext", "MediaTrackPrevious"].includes(event.key))) stagePrevious();
  }

  function onNavigationStart() { if (enabled) stagePrevious(); }

  function onNavigationFinish() {
    if (!enabled) return;
    const ctx = context();
    if (!ctx) {
      const url = new URL(location.href);
      const avatar = document.querySelector("ytd-masthead #avatar-btn, #masthead #avatar-btn, ytd-masthead button#avatar");
      const stillWatchLater = url.origin === "https://www.youtube.com" && url.pathname.replace(/\/$/, "") === "/watch" && url.searchParams.get("list") === "WL" && avatar && !avatar.closest("[hidden]");
      // A new video's advertisement/loading phase is not a departure from WL.
      if (!stillWatchLater) { clearPending(); clearResult(); detachTracking(); session = null; }
      return;
    }
    if (pending?.nextVideoId && ctx.videoId !== pending.nextVideoId && ctx.videoId !== pending.videoId) clearPending();
    ensureSession(ctx); maybeNotice();
  }

  function onMediaReady(event) {
    if (event.target instanceof HTMLVideoElement && event.target.closest("#movie_player")) onNavigationFinish();
  }

  const listeners = [
    ["ended", onEnded], ["playing", onPlaying], ["pause", onPause],
    ["loadstart", onResourceReset], ["emptied", onResourceReset], ["seeking", onSeek], ["seeked", onSeek],
    ["click", onManualNext], ["keydown", onManualNext], ["yt-navigate-start", onNavigationStart],
    ["yt-navigate-finish", onNavigationFinish], ["loadedmetadata", onMediaReady],
  ];
  window.addEventListener("tubeorder:cleanup-settings", event => {
    const nextEnabled = event.detail?.enabled === true;
    if (nextEnabled === enabled) return;
    enabled = nextEnabled;
    for (const [name, handler] of listeners) document[enabled ? "addEventListener" : "removeEventListener"](name, handler, true);
    if (enabled) ensureSession(context());
    else { clearPending(); clearResult(); detachTracking(); session = null; }
  });
  window.addEventListener("tubeorder:sort-unlocked", () => { if (enabled) maybeNotice(); });
  window.addEventListener("tubeorder:cleanup-context-ready", () => { if (enabled) ensureSession(context()); });
  window.addEventListener("tubeorder:cleanup-preview", () => {
    const ctx = context();
    if (!ctx || pending || inFlight || document.getElementById("tubeorder-lock")) return;
    pending = { preview: true, videoId: "tubeorder-preview", setVideoId: "tubeorder-preview",
      percent: 80, nextVideoId: ctx.videoId, nextPlaying: true, deadline: null };
    expiryTimer = setTimeout(clearPending, TRANSITION_MS);
    maybeNotice();
  });
  window.addEventListener("tubeorder:remove-watched-result", event => {
    const result = event.detail;
    if (!inFlight || result?.requestId !== inFlight || result.type === "started") return;
    inFlight = null;
    if (result.type === "done") showResult("done", "Vídeo assistido removido do Assistir mais tarde.");
    else showResult("error", "Não consegui confirmar a remoção do vídeo anterior.");
    maybeNotice();
  });
  window.dispatchEvent(new CustomEvent("tubeorder:cleanup-ready"));
})();
