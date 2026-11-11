(function () {
  "use strict";
  if (globalThis.TubeOrderRowActions) return;
  const mounted = new Map();
  const pending = new Map();
  let style = null, toast = null, toastTimer = null;

  function ensureStyle() {
    if (style?.isConnected) return;
    style = document.createElement("style");
    style.textContent = `
      .tubeorder-remove { display:inline-flex!important;align-items:center;justify-content:center;vertical-align:middle;flex:none;order:2;margin-inline-start:5px;padding:2px 7px;min-height:22px;border:1px solid #c5aaff40;border-radius:12px;background:#c5aaff12;color:#dfcffb;font:600 10px/1.4 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;cursor:pointer;white-space:nowrap; }
      .tubeorder-remove:hover:not(:disabled) { background:#c5aaff2c; }
      .tubeorder-remove:disabled { opacity:.6;cursor:default; }
      .tubeorder-remove:focus-visible { outline:2px solid #d9c3ff;outline-offset:2px; }
      #tubeorder-action-result { position:fixed;right:24px;bottom:24px;z-index:2147483646;display:flex;align-items:flex-start;gap:10px;box-sizing:border-box;width:min(350px,calc(100vw - 32px));padding:14px;border:1px solid #c5aaff40;border-radius:14px;background:#241c31;color:#eee7fa;box-shadow:0 12px 45px #0006;font:12px/1.5 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
      #tubeorder-action-result p { margin:0;flex:1; }
      #tubeorder-action-result button { border:0;background:none;color:#bcb0cc;font:18px/1 sans-serif;cursor:pointer; }
    `;
    document.documentElement.appendChild(style);
  }

  function clearToast() { clearTimeout(toastTimer); toast?.remove(); toast = toastTimer = null; }
  function notify(message, error = false) {
    ensureStyle(); clearToast();
    toast = document.createElement("aside"); toast.id = "tubeorder-action-result";
    toast.setAttribute("role", "status"); toast.setAttribute("aria-live", "polite");
    const mark = document.createElement("span"); mark.textContent = error ? "!" : "✓"; mark.style.color = error ? "#ffaaa5" : "#83df9d";
    const text = document.createElement("p"); text.textContent = message;
    const dismiss = document.createElement("button"); dismiss.type = "button"; dismiss.textContent = "×"; dismiss.setAttribute("aria-label", "Fechar aviso do TubeOrder");
    dismiss.addEventListener("click", clearToast);
    toast.append(mark, text, dismiss); document.documentElement.appendChild(toast);
    toastTimer = setTimeout(clearToast, error ? 15000 : 5000);
  }

  function release(requestId, result) {
    const current = pending.get(requestId);
    if (!current) return;
    clearTimeout(current.timer); pending.delete(requestId);
    current.button.disabled = false; current.button.textContent = "Remover";
    const done = result.type === "done" && result.serverConfirmed === true && result.queueConfirmed === true;
    notify(done ? "Vídeo removido do Assistir mais tarde." : result.message || "Não consegui confirmar a remoção. Confira a lista antes de tentar novamente.", !done);
  }

  function remove(entry, event) {
    event.preventDefault(); event.stopPropagation();
    if (!event.isTrusted || entry.button.disabled || document.getElementById("tubeorder-lock")) return;
    if (!chrome.runtime.id) { notify("A extensão foi atualizada. Recarregue esta aba do YouTube para reativar os botões.", true); return; }
    if (!entry.row.isConnected) return;
    const requestId = crypto.randomUUID();
    entry.button.disabled = true; entry.button.textContent = "Removendo…";
    const timer = setTimeout(() => release(requestId, { type: "error", message: "O YouTube demorou para confirmar a remoção. Confira a lista antes de tentar novamente." }), 25000);
    pending.set(requestId, { button: entry.button, timer });
    window.dispatchEvent(new CustomEvent("tubeorder:manual-remove-request", { detail: { requestId, videoId: entry.id, contextUrl: location.href } }));
  }

  function sync(videos) {
    ensureStyle();
    const activeRows = new Set(videos.map(video => video.row));
    for (const [row, entry] of mounted) if (!activeRows.has(row) || !row.isConnected) { entry.button.remove(); mounted.delete(row); }
    for (const { row, id } of videos) {
      if (!id || id.startsWith("unavailable-")) continue;
      let entry = mounted.get(row);
      if (!entry) {
        const button = document.createElement("button"); button.type = "button"; button.className = "tubeorder-remove"; button.textContent = "Remover";
        button.title = "Remover de verdade do Assistir mais tarde"; button.setAttribute("aria-label", "Remover do Assistir mais tarde");
        entry = { row, id, button }; mounted.set(row, entry);
        button.addEventListener("click", event => remove(entry, event));
      }
      entry.id = id;
      if (!entry.button.isConnected) {
        const block = [...row.querySelectorAll("button")].find(button => button !== entry.button && /bloquear/i.test(button.textContent || button.getAttribute("aria-label") || ""));
        if (block) block.insertAdjacentElement("afterend", entry.button);
        else (row.querySelector("#byline-container, #video-info, #meta") || row).appendChild(entry.button);
      }
    }
  }

  function destroy() {
    for (const entry of mounted.values()) entry.button.remove();
    mounted.clear();
    for (const item of pending.values()) clearTimeout(item.timer);
    pending.clear(); clearToast(); style?.remove(); style = null;
  }
  window.addEventListener("tubeorder:manual-remove-result", event => {
    const result = event.detail;
    if (result?.type !== "started" && typeof result?.requestId === "string") release(result.requestId, result);
  });
  globalThis.TubeOrderRowActions = Object.freeze({ sync, destroy, notify });
})();
