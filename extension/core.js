(function () {
  "use strict";

  function parseDuration(text) {
    if (typeof text !== "string") return null;
    const normalized = text.replace(/[\u200e\u200f\u202a-\u202e]/g, "").trim();
    if (/\b(live|ao vivo|estreia|premiere|upcoming)\b/i.test(normalized)) return null;
    const match = normalized.match(/(?:^|[^\d:])(\d+:\d{2}(?::\d{2})?)(?![\d:])/);
    if (!match) return null;
    const parts = match[1].split(":").map(Number);
    if (parts.slice(1).some((part) => part > 59)) return null;
    const seconds = parts.reduce((sum, part) => sum * 60 + part, 0);
    return Number.isSafeInteger(seconds) && seconds > 0 ? seconds : null;
  }

  function sortVideos(videos, order) {
    if (order !== "asc" && order !== "desc") throw new Error("Ordem inválida");
    const direction = order === "asc" ? 1 : -1;
    return videos.map((video, index) => ({ ...video, originalIndex: video.originalIndex ?? index }))
      .sort((a, b) => {
        const aKnown = Number.isFinite(a.duration) && a.duration > 0;
        const bKnown = Number.isFinite(b.duration) && b.duration > 0;
        if (aKnown !== bKnown) return aKnown ? -1 : 1;
        if (aKnown && a.duration !== b.duration) return (a.duration - b.duration) * direction;
        return a.originalIndex - b.originalIndex;
      });
  }

  // Keep the largest already ordered prefix/suffix, then use native edge moves.
  // The sequence is linear in playlist size; an ordered list needs no requests.
  function planMoves(currentIds, targetIds, options = {}) {
    const currentSet = new Set(currentIds);
    if (currentIds.length !== targetIds.length || currentSet.size !== currentIds.length ||
        new Set(targetIds).size !== targetIds.length || targetIds.some((id) => !currentSet.has(id))) {
      throw new Error("A playlist mudou. Atualize a página e tente novamente.");
    }
    let prefix = 0;
    for (const id of currentIds) if (id === targetIds[prefix]) prefix += 1;
    let suffix = targetIds.length - 1;
    for (let i = currentIds.length - 1; i >= 0; i -= 1) {
      if (currentIds[i] === targetIds[suffix]) suffix -= 1;
    }
    const topMoves = targetIds.slice(0, suffix + 1).reverse().map((id) => ({ id, edge: "top" }));
    const bottomMoves = targetIds.slice(prefix).map((id) => ({ id, edge: "bottom" }));
    return options.topOnly || topMoves.length <= bottomMoves.length ? topMoves : bottomMoves;
  }

  const api = { parseDuration, sortVideos, planMoves };
  globalThis.TubeOrderCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
