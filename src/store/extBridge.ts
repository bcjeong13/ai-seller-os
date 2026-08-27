// ============================================================
// 확장과 이야기하는 다리
//
// ★ 앱은 다른 탭(네이버 등)을 만질 수 없다. 확장만 할 수 있다.
//   그래서 window.postMessage 로 부탁하고, 확장이 대신 채운다.
//
// ★ 확장 ID를 알 필요가 없다. 확장이 이 페이지에 붙여둔 다리가 받는다.
// ★ 확장이 없으면 조용히 없는 것으로 둔다 — 복사 방식은 그대로 쓸 수 있다.
// ============================================================

export interface FillResult {
  ok: boolean;
  filled?: string[];
  missed?: string[];
  reason?: string;
}

export const FIELD_LABEL: Record<string, string> = {
  name: "상품명", price: "판매가", stock: "재고수량",
  category: "카테고리 검색어", detail: "상세설명",
  returnFee: "반품배송비", exchangeFee: "교환배송비",
  asPhone: "A/S 전화번호", asGuide: "A/S 안내",
};

export function fieldNames(keys?: string[]): string {
  return (keys ?? []).map((k) => FIELD_LABEL[k] ?? k).join(", ");
}

// ------------------------------------------------------------
// 확장이 붙어 있는가
// ------------------------------------------------------------

let ready = false;
const readyListeners = new Set<(v: boolean) => void>();

function markReady() {
  if (ready) return;
  ready = true;
  readyListeners.forEach((l) => l(true));
}

function ping() {
  window.postMessage({ source: "AISOS_APP", type: "PING" }, window.location.origin);
}

if (typeof window !== "undefined") {
  window.addEventListener("message", (ev: MessageEvent) => {
    if (ev.source !== window) return;
    const m = ev.data;
    if (m?.source === "AISOS_EXT" && m.type === "READY") markReady();
  });

  // 확장이 언제 붙을지 모른다. 한 번만 묻고 포기하면 놓친다.
  ping();
  const retries = [100, 400, 1200, 3000];
  retries.forEach((ms) =>
    setTimeout(() => { if (!ready) ping(); }, ms)
  );
}

/** 화면에서 [연결 확인]을 눌렀을 때 — 지금 다시 물어본다 */
export function recheckExt(): Promise<boolean> {
  return new Promise((resolve) => {
    if (ready) { resolve(true); return; }
    ping();
    setTimeout(() => resolve(ready), 600);
  });
}

export function isExtReady(): boolean {
  return ready;
}

export function onExtReady(fn: (v: boolean) => void): () => void {
  readyListeners.add(fn);
  if (ready) fn(true);
  return () => readyListeners.delete(fn);
}

// ------------------------------------------------------------
// 채우기 부탁
// ------------------------------------------------------------

let seq = 0;

/** 확장이 응답하지 않으면 계속 기다리지 않는다 */
const TIMEOUT_MS = 8000;

export function requestFill(block: string): Promise<FillResult> {
  if (typeof window === "undefined") {
    return Promise.resolve({ ok: false, reason: "브라우저가 아닙니다" });
  }

  const id = `fill-${++seq}`;

  return new Promise<FillResult>((resolve) => {
    let done = false;

    const finish = (r: FillResult) => {
      if (done) return;
      done = true;
      window.removeEventListener("message", onMsg);
      clearTimeout(timer);
      resolve(r);
    };

    const onMsg = (ev: MessageEvent) => {
      if (ev.source !== window) return;
      const m = ev.data;
      if (m?.source !== "AISOS_EXT" || m.type !== "FILL_RESULT" || m.id !== id) return;
      markReady();
      finish(m.result ?? { ok: false, reason: "응답이 비었습니다" });
    };

    const timer = setTimeout(() => {
      finish({
        ok: false,
        reason: ready
          ? "확장이 응답하지 않습니다. 확장을 새로고침하고 다시 눌러주세요."
          : "확장을 찾지 못했습니다. edge://extensions 에서 새로고침한 뒤 이 화면도 새로고침해 주세요.",
      });
    }, TIMEOUT_MS);

    window.addEventListener("message", onMsg);
    window.postMessage({ source: "AISOS_APP", type: "FILL", id, block }, window.location.origin);
  });
}
