// ============================================================
// 메인 화면 — "오늘 해야 할 일" (개발지시서 §4)
// ★ 정상인 것은 보여주지 않는다. 문제 있는 것만.
// ★ 사용자가 다음 행동을 고민하지 않게 한다.
// ============================================================

import { useStore, getProducts, getOrders, feeProfileOf } from "../store/db";
import { nextActionOf } from "../domain/orders";
import type { Order } from "../domain/orders";
import type { Product } from "../domain/types";
import { isStale } from "../domain/freshness";
import { computeOptionProfits } from "../domain/profitEngine";
import { currentGrade } from "../domain/status";
import { priceOpportunities } from "../domain/trend";
import { formatKrw } from "../domain/money";
import { WatchPanel } from "./WatchPanel";

export interface TodoBuckets {
  newOrders: Order[];       // 발주 안전검사 필요
  toOrder: Order[];         // 도매처에 발주
  toTrack: Order[];         // 송장 입력
  toShip: Order[];          // 마켓에 발송처리
  toConfirm: Order[];       // 배송 완료 확인
  toSettle: Order[];        // 정산 입력
  problems: Order[];        // 예외 처리 필요
  priceCheck: Product[];    // 공급가 확인 필요
  toList: Product[];        // 마켓에 등록 필요
  losing: Product[];        // 지금 팔면 손해
  drafts: Product[];        // 소싱센터에서 담아만 둔 것 — 아직 판매가가 없다
  normalCount: number;
}

export function buildTodos(now: number): TodoBuckets {
  const orders = getOrders();
  const products = getProducts();

  const newOrders: Order[] = [];
  const toOrder: Order[] = [];
  const toTrack: Order[] = [];
  const toShip: Order[] = [];
  const toConfirm: Order[] = [];
  const toSettle: Order[] = [];
  const problems: Order[] = [];

  for (const o of orders) {
    if (o.stage === "SETTLED") continue;
    switch (nextActionOf(o)) {
      case "RESOLVE": problems.push(o); break;
      case "CHECK_ORDER": newOrders.push(o); break;
      case "PLACE_ORDER": toOrder.push(o); break;
      case "ENTER_TRACKING": toTrack.push(o); break;
      case "MARK_SHIPPED": toShip.push(o); break;
      case "CONFIRM_DELIVERY": toConfirm.push(o); break;
      case "SETTLE": toSettle.push(o); break;
      default: break;
    }
  }

  const priceCheck: Product[] = [];
  const toList: Product[] = [];
  const losing: Product[] = [];
  const drafts: Product[] = [];
  let normalCount = 0;

  for (const p of products) {
    // ★ 판매가를 아직 안 정한 초안은 손익을 판정하지 않는다.
    //   0원으로 계산하면 무엇이든 손해로 나와서, 진짜 손해 상품이 묻힌다.
    if (p.price.buyerPaidKrw <= 0) { drafts.push(p); continue; }

    const fee = feeProfileOf(p.marketplace);
    const grade = currentGrade(p, fee);
    const opts = computeOptionProfits(p, fee);
    const stale = isStale(p.lastCollectedAt, now);
    const notListed = p.status !== "DRAFT" && !p.listings.some((l) => l.listed);

    let flagged = false;
    if (grade === "LOSS" || opts.lossCount > 0 || p.supplierStock === "OUT_OF_STOCK") {
      losing.push(p); flagged = true;
    }
    if (stale) { priceCheck.push(p); flagged = true; }
    if (notListed) { toList.push(p); flagged = true; }
    if (!flagged) normalCount++;
  }

  return { newOrders, toOrder, toTrack, toShip, toConfirm, toSettle, problems, priceCheck, toList, losing, drafts, normalCount };
}

export type TodoKey =
  | "problems" | "newOrders" | "toOrder" | "toTrack" | "toShip"
  | "toConfirm" | "toSettle" | "losing" | "priceCheck" | "toList" | "drafts";

interface Row {
  key: TodoKey;
  icon: string;
  label: string;
  count: number;
  tone: "red" | "orange" | "yellow" | "blue";
}

export function Today({ onOpen, onImport }: { onOpen: (k: TodoKey) => void; onImport: () => void }) {
  useStore();
  const now = Date.now();
  const t = buildTodos(now);

  const rows: Row[] = ([
    { key: "problems",   icon: "🔴", label: "문제 해결 필요",   count: t.problems.length,   tone: "red" },
    { key: "losing",     icon: "🔴", label: "지금 팔면 손해",   count: t.losing.length,     tone: "red" },
    { key: "newOrders",  icon: "🔴", label: "새 주문 확인",     count: t.newOrders.length,  tone: "red" },
    { key: "toOrder",    icon: "🟠", label: "도매처에 발주",     count: t.toOrder.length,    tone: "orange" },
    { key: "toTrack",    icon: "🟠", label: "송장번호 입력",     count: t.toTrack.length,    tone: "orange" },
    { key: "toShip",     icon: "🟡", label: "마켓에 발송처리",   count: t.toShip.length,     tone: "yellow" },
    { key: "priceCheck", icon: "🟡", label: "공급가 확인",       count: t.priceCheck.length, tone: "yellow" },
    { key: "drafts",     icon: "🔵", label: "판매가 정하기",     count: t.drafts.length,     tone: "blue" },
    { key: "toList",     icon: "🔵", label: "마켓에 등록",       count: t.toList.length,     tone: "blue" },
    { key: "toConfirm",  icon: "🔵", label: "배송 완료 확인",     count: t.toConfirm.length,  tone: "blue" },
    { key: "toSettle",   icon: "🔵", label: "정산 입력",         count: t.toSettle.length,   tone: "blue" },
  ] as Row[]).filter((r) => r.count > 0);

  const total = rows.reduce((s, r) => s + r.count, 0);

  return (
    <div className="today">
      <div className="today-head">
        <h2>오늘 해야 할 일</h2>
        {total > 0 && <span className="today-total">{total}건</span>}
      </div>

      {rows.length === 0 ? (
        <div className="today-empty">
          <div className="big">🎉</div>
          <div className="t1">지금 할 일이 없습니다</div>
          <div className="t2">
            {t.normalCount > 0
              ? `상품 ${t.normalCount}개가 정상입니다. 손댈 것 없습니다.`
              : "상품을 추가하거나 주문을 가져와 시작하세요."}
          </div>
        </div>
      ) : (
        <div className="todo-list">
          {rows.map((r) => (
            <button key={r.key} className={`todo-row ${r.tone}`} onClick={() => onOpen(r.key)}>
              <span className="ico">{r.icon}</span>
              <span className="lbl">{r.label}</span>
              <span className="cnt">{r.count}</span>
              <span className="arw">›</span>
            </button>
          ))}
        </div>
      )}

      {t.normalCount > 0 && rows.length > 0 && (
        <div className="today-normal">✅ 나머지 {t.normalCount}개는 정상 — 볼 것 없습니다</div>
      )}

      {/* 사전 방어선 — 주문이 들어오기 전에 공급가·재고 변동을 잡는다 */}
      <WatchPanel />

      {/* 공급가가 내려간 것 — 새 상품 찾기가 아니라 이미 파는 상품에서 돈이 생긴 것 */}
      <PriceOpportunities />

      <div className="today-actions">
        <button className="btn primary lg" onClick={onImport}>📥 주문 가져오기</button>
      </div>
    </div>
  );
}

function PriceOpportunities() {
  const now = Date.now();
  const list = priceOpportunities(getProducts(), now).slice(0, 5);
  if (!list.length) return null;

  return (
    <div className="card pad">
      <div className="section-label">
        💰 공급가가 내려갔습니다 <span className="tiny muted">이미 파는 상품</span>
      </div>
      <p className="hint" style={{ marginTop: 0 }}>
        마진이 늘었습니다. 그대로 둬도 되고, 가격을 낮춰 더 팔아볼 수도 있습니다.
      </p>
      {list.map((s) => (
        <div key={s.id} className="opp-row">
          <div className="opp-name">{s.subject}</div>
          <div className="opp-num">
            <span className="muted">{formatKrw(s.previousValue ?? 0)}</span>
            {" → "}
            <b>{formatKrw(s.value ?? 0)}</b>
          </div>
          <div className="opp-why">{s.evidence}</div>
        </div>
      ))}
    </div>
  );
}
