// ============================================================
// 다리 — 앱 화면(localhost:5173)에만 붙는다
//
// ★ 앱은 확장을 직접 부를 수 없다. window.postMessage 로 부탁하면
//   여기서 받아 백그라운드에 넘긴다.
// ★ 앱 화면 외의 어떤 페이지에도 붙지 않는다 (manifest의 matches).
// ★ 읽지도 보내지도 않는다. 앱이 준 값을 그대로 전달만 한다.
// ============================================================

(function () {
  // 앱이 "확장이 깔려 있는가"를 알 수 있게 알린다
  function announce() {
    window.postMessage({ source: "AISOS_EXT", type: "READY" }, window.location.origin);
  }
  announce();
  document.addEventListener("DOMContentLoaded", announce);

  window.addEventListener("message", (ev) => {
    if (ev.source !== window) return;
    const m = ev.data;
    if (!m || m.source !== "AISOS_APP") return;

    if (m.type === "PING") { announce(); return; }
    if (m.type !== "FILL") return;

    chrome.runtime.sendMessage({ type: "AISOS_FILL", block: m.block }, (res) => {
      const err = chrome.runtime.lastError;
      window.postMessage({
        source: "AISOS_EXT",
        type: "FILL_RESULT",
        id: m.id,
        result: err ? { ok: false, reason: "확장을 다시 불러와 주세요" } : res,
      }, window.location.origin);
    });
  });
})();
