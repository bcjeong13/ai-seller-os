// ============================================================
// 백그라운드 — 앱 화면의 버튼과 마켓 탭을 잇는다
//
// ★ 앱(localhost:5173)은 다른 탭을 만질 수 없다. 확장만 할 수 있다.
//   그래서 앱이 다리(bridge.js)로 부탁하면 여기서 마켓 탭을 찾아 채운다.
//
// ★ 저장하지 않는다. 값만 넣고 멈춘다.
// ★ 사용자가 앱에서 버튼을 눌렀을 때만 움직인다. 스스로 하지 않는다.
// ============================================================

importScripts("fill.js");

/** 열려 있는 탭 중 그 마켓의 등록화면을 찾는다 */
async function findMarketTab(site) {
  const host = AISOS_SITE_HOST[site];
  if (!host) return { error: "이 마켓은 아직 지원하지 않습니다" };

  const tabs = await chrome.tabs.query({ url: `*://${host}/*` });
  if (!tabs.length) {
    return { error: `${host} 탭이 열려 있지 않습니다. 상품등록 화면을 먼저 열어주세요.` };
  }
  // 여러 개면 가장 마지막에 본 것
  const tab = tabs.sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0];
  return { tab };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== "AISOS_FILL") return;

  (async () => {
    try {
      const payload = aisosParseFill(msg.block);
      if (!payload.site) {
        sendResponse({ ok: false, reason: "채울 값이 아닙니다" });
        return;
      }

      const found = await findMarketTab(payload.site);
      if (found.error) {
        sendResponse({ ok: false, reason: found.error });
        return;
      }

      const res = await chrome.scripting.executeScript({
        target: { tabId: found.tab.id },
        func: aisosFillProbe,
        args: [payload],
      });
      const r = (res && res[0] && res[0].result) || { ok: false, reason: "채우지 못했습니다" };

      // 사람이 눈으로 확인해야 하므로 그 탭을 앞으로 가져온다
      if (r.ok && r.filled.length) {
        try {
          await chrome.tabs.update(found.tab.id, { active: true });
          await chrome.windows.update(found.tab.windowId, { focused: true });
        } catch (e) { /* 창을 못 옮겨도 채우기는 끝났다 */ }
      }

      sendResponse(r);
    } catch (e) {
      sendResponse({ ok: false, reason: "이 페이지에서는 동작하지 않습니다" });
    }
  })();

  return true; // 비동기 응답
});
