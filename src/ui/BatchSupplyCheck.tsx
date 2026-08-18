// ============================================================
// 발주 전 일괄 가격 점검
// ★ 위탁판매의 구조적 방어선: 고객이 결제했어도 "발주는 내 손으로" 한다.
//   밤사이 주문이 100건 쌓여도 상품은 몇 개뿐이다.
//   상품마다 지금 공급가를 한 번만 확인하면 그 상품의 모든 주문이 한꺼번에 걸린다.
// ============================================================

import { useState } from "react";
import type { Order } from "../domain/orders";
import type { Product } from "../domain/types";
import { getProduct, feeProfileOf, updateCost, addOrderException, useStore } from "../store/db";
import { computeProfit, supplyHeadroom } from "../domain/profitEngine";
import { formatKrw } from "../domain/money";

interface Group {
  product: Product;
  orders: Order[];
  qty: number;
}

function groupByProduct(orders: Order[]): Group[] {
  const map = new Map<string, Group>();
  for (const o of orders) {
    if (!o.productId) continue;
    const p = getProduct(o.productId);
    if (!p) continue;
    const g = map.get(p.id) ?? { product: p, orders: [], qty: 0 };
    g.orders.push(o);
    g.qty += o.quantity || 1;
    map.set(p.id, g);
  }
  return [...map.values()].sort((a, b) => b.orders.length - a.orders.length);
}

export function BatchSupplyCheck({ orders }: { orders: Order[] }) {
  useStore();
  const groups = groupByProduct(orders);
  if (groups.length === 0) return null;

  return (
    <div className="card pad" style={{ borderColor: "var(--accent)" }}>
      <div className="section-label">🛡️ 발주 전 가격 점검</div>
      <p className="hint" style={{ marginTop: 0 }}>
        주문 <b>{orders.length}건</b>이 상품 <b>{groups.length}개</b>에서 나왔습니다.
        상품마다 도매처 <b>지금 가격</b>만 확인하면 전부 한 번에 걸러집니다.
      </p>
      {groups.map((g) => <GroupRow key={g.product.id} group={g} />)}
    </div>
  );
}

function GroupRow({ group }: { group: Group }) {
  const { product: p, orders, qty } = group;
  const fee = feeProfileOf(p.marketplace);
  const base = p.cost.supplyPriceKrw;
  const [now, setNow] = useState(base);
  const [done, setDone] = useState(false);

  const h = supplyHeadroom(p.price, p.cost, fee);
  const after = computeProfit(p.price, { ...p.cost, supplyPriceKrw: now }, { feeProfile: fee });
  const perUnit = after.netProfitKrw;
  const total = perUnit * qty;
  const risky = perUnit < 0;
  const changed = now !== base;

  const apply = () => {
    if (changed) updateCost(p.id, { ...p.cost, supplyPriceKrw: now }, "발주 전 가격 점검");
    setDone(true);
  };

  const holdAll = () => {
    if (!confirm(`${p.name}\n주문 ${orders.length}건을 전부 보류합니다.\n\n발주하지 않고 문제 목록으로 옮깁니다.`)) return;
    if (changed) updateCost(p.id, { ...p.cost, supplyPriceKrw: now }, "발주 전 가격 점검 — 인상 확인");
    orders.forEach((o) => addOrderException(o.id, "SUPPLY_PRICE_UP", `공급가 ${formatKrw(base)} → ${formatKrw(now)}`));
    setDone(true);
  };

  return (
    <div className={"bsc-row" + (risky ? " bad" : done ? " done" : "")}>
      <div className="bsc-head">
        <div className="bsc-name">{p.name}</div>
        <div className="bsc-count">주문 {orders.length}건 · {qty}개</div>
      </div>

      <div className="bsc-limit">
        한계선 <b>{formatKrw(h.maxSupplyPriceKrw)}</b> — 이 위로 오르면 적자
        {p.sourceUrl && (
          <a className="bsc-link" href={p.sourceUrl} target="_blank" rel="noreferrer">도매처 열기 ↗</a>
        )}
      </div>

      <div className="bsc-input">
        <span>등록 {formatKrw(base)}</span>
        <span className="bsc-arrow">→</span>
        <input type="number" value={now} disabled={done}
               onChange={(e) => setNow(Math.max(0, +e.target.value))} />
        <span>원</span>
      </div>

      {done ? (
        <div className="bsc-done">✅ 확인 완료</div>
      ) : risky ? (
        <>
          <div className="bsc-warn">
            지금 발주하면 <b>{orders.length}건 합쳐 {formatKrw(Math.abs(total))} 손해</b>입니다
            (1개당 {formatKrw(Math.abs(perUnit))}).
          </div>
          <div className="btn-row">
            <button className="btn primary" onClick={holdAll}>{orders.length}건 전부 보류</button>
            <button className="btn sm" onClick={apply}>가격만 갱신하고 넘기기</button>
          </div>
        </>
      ) : (
        <div className="btn-row">
          <button className="btn primary" onClick={apply}>
            {changed ? `확인 — 1건당 ${formatKrw(perUnit)} 남음` : "변동 없음 — 확인"}
          </button>
        </div>
      )}
    </div>
  );
}
