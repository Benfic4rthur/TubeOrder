(function () {
  "use strict";
  if (globalThis.TubeOrderCleanupUI) return;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function makeIcon() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "20 24 90 80");
    svg.setAttribute("fill", "none");
    svg.setAttribute("aria-hidden", "true");
    const shapes = [
      ["path", { d: "M30 39a4 4 0 0 1 6-3.46l35 25a4.25 4.25 0 0 1 0 6.92l-35 25A4 4 0 0 1 30 89Z", fill: "currentColor" }],
      ...[[35, 25], [59.5, 19], [84, 13]].map(([y, width]) => ["rect", { x: 78, y, width, height: 9, rx: 4.5, fill: "#fff" }]),
    ];
    for (const [tag, attributes] of shapes) {
      const shape = document.createElementNS("http://www.w3.org/2000/svg", tag);
      for (const [name, value] of Object.entries(attributes)) shape.setAttribute(name, value);
      svg.appendChild(shape);
    }
    return svg;
  }
  const styles = `
    :host { position:fixed!important; right:24px!important; bottom:24px!important; z-index:2147483646!important; display:block!important; width:min(350px,calc(100vw - 32px))!important; pointer-events:auto; color-scheme:dark; color:#eee7fa; font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    * { box-sizing:border-box; }
    .toast { padding:14px; border:1px solid #c7aaff38; border-radius:15px; background:#241c31; box-shadow:0 12px 45px #0006; }
    .content { display:flex; align-items:flex-start; gap:9px; }
    .mark { display:grid; place-items:center; flex:none; width:22px; height:22px; margin-top:1px; border-radius:6px; background:linear-gradient(140deg,#ddd0ff,#ad8af7); color:#231a3c; }
    .mark svg { width:18px; height:18px; }
    .copy { min-width:0; flex:1; }
    .title { margin:0; font-size:12px; font-weight:650; line-height:1.5; }
    .description { margin:4px 0 0; color:#beb1cf; font-size:11px; line-height:1.5; }
    .actions { display:flex; justify-content:flex-end; margin-top:11px; }
    button { cursor:pointer; font:600 11px/1.4 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    .cancel { min-height:30px; padding:5px 12px; border:1px solid #decaff50; border-radius:8px; background:#c9afff; color:#271b3e; }
    .cancel:hover:not(:disabled) { background:#dfccff; }
    .cancel:disabled { cursor:default; opacity:.55; }
    button:focus-visible { outline:2px solid #e4d4ff; outline-offset:3px; }
    .dismiss { display:grid; place-items:center; flex:none; width:22px; height:22px; padding:0; border:0; border-radius:5px; background:none; color:#b2a4c1; font-size:20px; font-weight:400; }
    .dismiss:hover { color:#fff; background:#ffffff0c; }
    .result-mark { display:grid; place-items:center; flex:none; width:21px; height:21px; border-radius:50%; color:#b8a1db; background:#b8a1db12; font-size:14px; font-weight:800; }
    .toast[data-type="done"] .result-mark { color:#83df9d; background:#83df9d14; }
    .toast[data-type="error"] .result-mark { color:#ffaaa5; background:#ffaaa514; }
    .result-title { margin:1px 0 0; font-size:12px; font-weight:550; line-height:1.5; overflow-wrap:anywhere; }
    @media(max-width:420px) { :host { right:16px!important; bottom:16px!important; } }
  `;

  function create(host, toast, label) {
    const shadow = host.shadowRoot || host.attachShadow({ mode: "open" });
    const style = element("style", null, styles);
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    toast.setAttribute("aria-atomic", "true");
    toast.setAttribute("aria-label", label);
    // Build nodes directly: YouTube enforces Trusted Types in the MAIN world.
    shadow.replaceChildren(style, toast);
    toast.addEventListener("click", (event) => event.stopPropagation());
    return shadow;
  }

  function mountNotice(host, handlers = {}) {
    const toast = element("aside", "toast");
    const content = element("div", "content");
    const mark = element("span", "mark");
    mark.appendChild(makeIcon());
    const copy = element("div", "copy");
    const title = element("p", "title", "Vídeo anterior: 80% assistido.");
    const description = element("p", "description", "Será removido do Assistir mais tarde em 6 s.");
    copy.append(title, description);
    content.append(mark, copy);
    const actions = element("div", "actions");
    const cancel = element("button", "cancel", "Não apagar");
    cancel.type = "button";
    actions.appendChild(cancel);
    toast.append(content, actions);
    const shadow = create(host, toast, "Remoção de vídeo assistido");
    let seconds = 6;
    let percent = 80;
    let destroyed = false;
    let cancelled = false;
    cancel.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (destroyed || cancelled) return;
      cancelled = true;
      cancel.disabled = true;
      handlers.onCancel?.();
    });
    return {
      update(status = {}) {
        if (destroyed) return;
        if (Number.isFinite(status.seconds) && status.seconds > 0) seconds = Math.max(1, Math.ceil(status.seconds));
        if (Number.isFinite(status.percent)) percent = Math.max(0, Math.min(100, Math.floor(status.percent)));
        const titleText = `Vídeo anterior: ${percent}% assistido.`;
        const descriptionText = `Será removido do Assistir mais tarde em ${seconds} s.`;
        if (title.textContent !== titleText) title.textContent = titleText;
        if (description.textContent !== descriptionText) description.textContent = descriptionText;
      },
      destroy() {
        destroyed = true;
        shadow.replaceChildren();
      }
    };
  }

  function mountResult(host, handlers = {}) {
    const toast = element("aside", "toast");
    toast.dataset.type = "pending";
    const content = element("div", "content");
    const mark = element("span", "result-mark", "·");
    mark.setAttribute("aria-hidden", "true");
    const copy = element("div", "copy");
    const message = element("p", "result-title", "Conferindo a remoção…");
    copy.appendChild(message);
    const dismiss = element("button", "dismiss", "×");
    dismiss.type = "button";
    dismiss.setAttribute("aria-label", "Fechar aviso");
    content.append(mark, copy, dismiss);
    toast.appendChild(content);
    const shadow = create(host, toast, "Resultado da remoção");
    let destroyed = false;
    let dismissed = false;
    dismiss.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (destroyed || dismissed) return;
      dismissed = true;
      handlers.onDismiss?.();
    });
    return {
      update(status = {}) {
        if (destroyed) return;
        const type = status.type === "done" ? "done" : "error";
        toast.dataset.type = type;
        mark.textContent = type === "done" ? "✓" : "!";
        message.textContent = typeof status.message === "string" && status.message
          ? status.message
          : type === "done" ? "Vídeo assistido removido do Assistir mais tarde." : "Não consegui confirmar a remoção do vídeo.";
      },
      destroy() {
        destroyed = true;
        shadow.replaceChildren();
      }
    };
  }

  globalThis.TubeOrderCleanupUI = Object.freeze({ mountNotice, mountResult });
})();
