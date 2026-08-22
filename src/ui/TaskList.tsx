// 할 일 하나를 클릭했을 때 나오는 목록 — 그 항목만 보여준다
import type { Order } from "../domain/orders";
import type { Product } from "../domain/types";
import { buildTodos, type TodoKey } from "./Today";
import { formatKrw } from "../domain/money";
import { CHANNEL_META, STAGE_META, Badge } from "./meta";
import { feeProfileOf, refreshCollectedAt, useStore } from "../store/db";
import { computeOptionProfits } from "../domain/profitEngine";
import { agoText } from "../domain/freshness";
import { BatchSupplyCheck } from "./BatchSupplyCheck";

const TITLES: Record<TodoKey, string> = {
  problems: "문제 해결 필요",
  losing: "지금 팔면 손해",
  newOrders: "새 주문 확인",
  toOrder: "도매처에 발주",
  toTrack: "송장번호 입력",
  toShip: "마켓에 발송처리",
  toConfirm: "배송 완료 확인",
  toSettle: "정산 입력",
  priceCheck: "공급가 확인",
  toList: "마켓에 등록",
  drafts: "판매가 정하기",
};

const ORDER_KEYS: TodoKey[] = [
  "problems", "newOrders", "toOrder", "toTrack", "toShip", "toConfirm", "toSettle",
];

export function TaskList({
  which, onBack, onOpenOrder, onOpenProduct,
}: {
  which: TodoKey;
  onBack: () => void;
  onOpenOrder: (o: Order) => void;
  onOpenProduct: (p: Product) => void;
}) {
  useStore();
  const now = Date.now();
  const t = buildTodos(now);
  const isOrder = ORDER_KEYS.includes(which);
  const orders = (t[which] as Order[]) ?? [];
  const products = (t[which] as Product[]) ?? [];

  return (
    <div className="work">
      <button className="back" onClick={onBack}>← 오늘 할 일</button>
      <h2 className="work-title">{TITLES[which]}</h2>

      {/* 발주 대기 주문은 상품별로 묶어 가격부터 점검한다 */}
      {(which === "toOrder" || which === "newOrders") && orders.length > 0 && (
        <BatchSupplyCheck orders={orders} />
      )}

      {(isOrder ? orders.length : products.length) === 0 && (
        <div className="card pad center">해당하는 항목이 없습니다.</div>
      )}

      <div className="rows">
        {isOrder
          ? orders.map((o) => (
              <button key={o.id} className="row" onClick={() => onOpenOrder(o)}>
                <div className="row-main">
                  <div className="row-title">{o.productName}</div>
                  <div className="row-sub">
                    {o.optionName && <>{o.optionName} · </>}{o.quantity}개 ·{" "}
                    <span className="chch" style={{ color: CHANNEL_META[o.marketplace].color, background: CHANNEL_META[o.marketplace].bg }}>
                      {CHANNEL_META[o.marketplace].short}
                    </span>{" "}
                    {o.marketOrderNo}
                  </div>
                </div>
                <div className="row-right">
                  <div className="row-amt">{formatKrw(o.price.buyerPaidKrw)}</div>
                  <Badge meta={STAGE_META[o.stage]} />
                </div>
                <span className="arw">›</span>
              </button>
            ))
          : products.map((p) => {
              const fee = feeProfileOf(p.marketplace);
              const opt = computeOptionProfits(p, fee);
              return (
                <div key={p.id} className="row static">
                  <div className="row-main">
                    <div className="row-title">{p.name}</div>
                    <div className="row-sub">
                      {p.supplierName || "도매처 미입력"} · 공급가 {formatKrw(p.cost.supplyPriceKrw)}
                      {which === "priceCheck" && <> · 확인 {agoText(p.lastCollectedAt, now)}</>}
                      {which === "losing" && opt.lossCount > 0 && <> · 역마진 옵션 {opt.lossCount}개</>}
                      {which === "drafts" && (
                        <> · 매입 {formatKrw(p.cost.supplyPriceKrw * Math.max(1, p.cost.minOrderQty ?? 1) + p.cost.shippingKrw)}
                          {p.options.length === 0 && p.specs.length === 0 && " · 상세 미수집"}</>
                      )}
                    </div>
                  </div>
                  <div className="row-right">
                    {which === "priceCheck" && p.sourceUrl && (
                      <a className="btn xs" href={p.sourceUrl} target="_blank" rel="noreferrer"
                         onClick={() => setTimeout(() => refreshCollectedAt(p.id), 500)}>
                        도매처 열기 ↗
                      </a>
                    )}
                    <button className="btn xs primary" onClick={() => onOpenProduct(p)}>
                      {which === "toList" ? "등록하기" : which === "drafts" ? "이어서 하기" : "자세히"}
                    </button>
                  </div>
                </div>
              );
            })}
      </div>
    </div>
  );
}
