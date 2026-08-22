// ============================================================
// 가격·재고 상시 감시 패널 (사전 방어선)
// ★ 정상 상품은 화면에 띄우지 않는다. 내가 손대야 하는 것만 보여준다.
// ============================================================

import { useState } from "react";
import { getProducts, getOrders, feeProfileOf, applyWatchResults, useStore } from "../store/db";
import {
  judgeWatch, needsCheck, buildWatchList, parseWatchResults, summarizeWatch,
  type WatchRow, type WatchContext,
} from "../domain/watch";
import { formatKrw } from "../domain/money";
import { agoText } from "../domain/freshness";

const DAY = 86400_000;

/** 마켓 판매관리 화면 — 위험 상품을 바로 내리러 갈 수 있게 */
const STOP_LINKS: { label: string; url: string }[] = [
  { label: "쿠팡 WING", url: "https://wing.coupang.com/vendor-inventory/list" },
  { label: "스마트스토어센터", url: "https://sell.smartstore.naver.com/#/products/origin-list" },
  { label: "11번가 셀러오피스", url: "https://soffice.11st.co.kr/" },
];

function contextOf(productId: string, now: number): WatchContext {
  const os = getOrders().filter((o) => o.productId === productId);
  return {
    ordersToday: os.filter((o) => now - o.createdAt < DAY).length,
    ordersWeek: os.filter((o) => now - o.createdAt < 7 * DAY).length,
  };
}

export function WatchPanel() {
  useStore();
  const now = Date.now();
  const [paste, setPaste] = useState("");
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState(false);

  // ★ 판매가를 아직 안 정한 초안은 감시하지 않는다.
  //   한계선이 0원으로 계산돼 무조건 🔴로 뜬다 — 진짜 위험한 상품이 묻힌다.
  const products = getProducts().filter((p) => p.sourceUrl && p.price.buyerPaidKrw > 0);
  const due = products.filter((p) => needsCheck(p, contextOf(p.id, now), now, feeProfileOf(p.marketplace)));

  // 지금 저장된 값 기준 위험도 — 확인하지 않아도 이미 아는 것들
  const rows: WatchRow[] = products.map((p) =>
    judgeWatch(p, p.cost.supplyPriceKrw, p.supplierStock, feeProfileOf(p.marketplace))
  );
  const sum = summarizeWatch(rows);

  const copyList = async (only: boolean) => {
    const target = only ? due : products;
    const text = buildWatchList(target.map((p) => ({ id: p.id, url: p.sourceUrl })));
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setMsg(`${target.length}개 목록을 복사했습니다. 확장의 [여러 상품 가격·재고 한 번에 점검]에 붙여넣으세요.`);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setMsg("복사 실패 — 브라우저에서 클립보드를 허용해 주세요.");
    }
  };

  const applyResults = () => {
    const results = parseWatchResults(paste);
    if (!results.length) {
      setMsg("점검 결과가 아닙니다. 확장의 [결과 복사]로 받은 내용을 붙여넣어 주세요.");
      return;
    }
    const r = applyWatchResults(results);
    setPaste("");
    setMsg(
      `${r.checked}개 확인 · 변동 ${r.changed}개` +
      (r.failed ? ` · ⚠️ 확인 실패 ${r.failed}개 (직접 확인하세요)` : "")
    );
  };

  if (products.length === 0) return null;

  return (
    <div className="card pad watch-panel">
      <div className="section-label">🛡️ 공급가·재고 감시</div>

      <div className="watch-sum">
        <WatchStat n={sum.risk.length} label="지금 위험" tone="bad" />
        <WatchStat n={sum.watch.length} label="곧 위험" tone="warn" />
        <WatchStat n={due.length} label="확인할 때가 됨" tone="mid" />
        <WatchStat n={sum.safeCount} label="정상" tone="ok" />
      </div>

      {sum.risk.length === 0 && sum.watch.length === 0 ? (
        <div className="hint" style={{ marginTop: 4 }}>
          ✅ 지금 손댈 상품이 없습니다. 정상 {sum.safeCount}개는 표시하지 않습니다.
        </div>
      ) : (
        <div className="watch-rows">
          {[...sum.risk, ...sum.watch].map((r) => (
            <div key={r.productId} className={"watch-row " + (r.level === "RISK" ? "bad" : "warn")}>
              <div className="watch-name">{r.level === "RISK" ? "🔴" : "🟡"} {r.name}</div>
              <div className="watch-msg">{r.message}</div>
              <div className="watch-limit">
                한계선 {formatKrw(r.limitKrw)} · 지금 {formatKrw(r.baseKrw)}
              </div>
              {r.level === "RISK" && (
                <div className="watch-links">
                  판매 중지 →
                  {STOP_LINKS.map((l) => (
                    <a key={l.label} href={l.url} target="_blank" rel="noreferrer">{l.label}</a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="watch-run">
        <div className="watch-step">
          <b>1</b> 점검할 목록을 복사합니다
          <div className="btn-row">
            <button className="btn primary sm" disabled={due.length === 0} onClick={() => copyList(true)}>
              {copied ? "복사됨 ✓" : `확인할 때가 된 ${due.length}개 복사`}
            </button>
            <button className="btn sm" onClick={() => copyList(false)}>전체 {products.length}개 복사</button>
          </div>
        </div>

        <div className="watch-step">
          <b>2</b> 확장에서 <b>점검 시작</b> → 끝나면 <b>결과 복사</b>
          <div className="hint">탭이 하나씩 열렸다 닫힙니다. 그동안 다른 일 하셔도 됩니다.</div>
        </div>

        <div className="watch-step">
          <b>3</b> 결과를 여기에 붙여넣습니다
          <textarea className="paste" rows={3} value={paste}
                    onChange={(e) => setPaste(e.target.value)}
                    placeholder="##AISOS-PRICES## 로 시작하는 결과를 붙여넣기" />
          <button className="btn primary sm" disabled={!paste.trim()} onClick={applyResults}>결과 반영</button>
        </div>
      </div>

      {msg && <div className="tiny" style={{ marginTop: 8 }}>{msg}</div>}

      {due.length > 0 && (
        <div className="hint" style={{ marginTop: 8 }}>
          가장 오래된 확인: {agoText(Math.min(...due.map((p) => p.lastCollectedAt)), now)}
        </div>
      )}
    </div>
  );
}

function WatchStat({ n, label, tone }: { n: number; label: string; tone: string }) {
  return (
    <div className={"watch-stat " + tone}>
      <div className="watch-n">{n}</div>
      <div className="watch-l">{label}</div>
    </div>
  );
}
