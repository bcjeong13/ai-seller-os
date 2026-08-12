import { useState } from "react";
import type { Product, CostInputs, SupplierStock } from "../domain/types";
import { getProduct, getOrdersFor, updateCost, updateProduct, setSupplierStock, refreshCollectedAt, deleteProduct, useStore } from "../store/db";
import { computeProfit } from "../domain/profitEngine";
import { productProfit } from "../domain/status";
import { formatKrw, formatPct } from "../domain/money";
import { agoText, freshnessLevel } from "../domain/freshness";
import { STATUS_META, SUPPLIER_STOCK_META, Badge } from "./meta";
import { PreflightModal } from "./PreflightModal";

export function ProductDetail({ id, onBack }: { id: string; onBack: () => void }) {
  useStore();
  const product = getProduct(id);
  const [showPreflight, setShowPreflight] = useState(false);
  if (!product) return <div className="card empty">상품을 찾을 수 없습니다.</div>;

  const pr = productProfit(product);
  const now = Date.now();
  const fresh = freshnessLevel(product.lastCollectedAt, now);

  return (
    <div>
      <button className="back" onClick={onBack}>← 목록으로</button>

      <div className="card">
        <div className="detail-head">
          <div style={{ flex: 1 }}>
            <h2>{product.name}</h2>
            <div className="tiny muted">
              {product.marketplace} · {product.sourceUrl ? <a href={product.sourceUrl} target="_blank" rel="noreferrer">1688 원본</a> : "URL 없음"}
              {" · "}데이터 {agoText(product.lastCollectedAt, now)} ({fresh})
            </div>
          </div>
          <Badge meta={STATUS_META[product.status]} />
        </div>

        <div style={{ padding: "0 22px 20px" }}>
          <div className="kv-grid">
            <KV k="국내 판매가" v={formatKrw(product.sellingPriceKrw)} />
            <KV k="1688 원가" v={formatKrw(pr.productPriceKrw)} />
            <KV k="공급처 재고" v={SUPPLIER_STOCK_META[product.supplierStock]} />
            <KV k="국제배송비" v={formatKrw(product.cost.internationalShippingKrw)} />
            <KV k="환율" v={`${product.cost.exchangeRate}원/¥`} />
            <KV k="예상 순이익" v={formatKrw(pr.netProfitKrw)} accent={pr.netProfitKrw < 0 ? "var(--loss)" : "var(--safe)"} />
            <KV k="순이익률" v={formatPct(pr.marginPct)} accent={pr.marginPct < product.minMarginPct ? "var(--warn)" : "var(--safe)"} />
            <KV k="셀러 재고" v={`${product.sellerInventory} (구매대행)`} />
          </div>

          {pr.netProfitKrw < 0 && (
            <div className="warn-note" style={{ marginTop: 14, background: "var(--loss-bg)", color: "var(--loss)" }}>
              🔴 <b>LOSS 위험</b> — 현재 원가 {formatKrw(pr.productPriceKrw)} 기준 예상 순이익 {formatKrw(pr.netProfitKrw)}.
              권장: ① 판매중지 ② 판매가 재계산 ③ 대체 공급처 검색
            </div>
          )}

          <div className="btn-row" style={{ marginTop: 16 }}>
            <button className="btn primary" onClick={() => setShowPreflight(true)}>🛒 고객 주문 (발주 검증)</button>
            <button className="btn" onClick={() => refreshCollectedAt(product.id)}>🔄 공급처 재확인</button>
          </div>
        </div>
      </div>

      <div className="two-col" style={{ marginTop: 16 }}>
        <Simulator product={product} />
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <SupplierPanel product={product} />
          <CostHistory product={product} />
        </div>
      </div>

      <OrderHistory id={product.id} />
      <EventLog product={product} />

      <div className="btn-row" style={{ marginTop: 20 }}>
        <button className="btn danger" onClick={() => { if (confirm("이 상품을 삭제할까요?")) { deleteProduct(product.id); onBack(); } }}>상품 삭제</button>
      </div>

      {showPreflight && <PreflightModal product={product} onClose={() => setShowPreflight(false)} />}
    </div>
  );
}

// ---------- 손익 시뮬레이터 ----------
function Simulator({ product }: { product: Product }) {
  const [selling, setSelling] = useState(product.sellingPriceKrw);
  const [cny, setCny] = useState(product.cost.productCostCny);
  const [rate, setRate] = useState(product.cost.exchangeRate);
  const [ship, setShip] = useState(product.cost.internationalShippingKrw);

  const draftCost: CostInputs = { ...product.cost, productCostCny: cny, exchangeRate: rate, internationalShippingKrw: ship };
  const sim = computeProfit(selling, draftCost, { customsThresholdKrw: product.customsThresholdKrw, dutyRatePct: product.dutyRatePct });

  const changed =
    selling !== product.sellingPriceKrw ||
    cny !== product.cost.productCostCny ||
    rate !== product.cost.exchangeRate ||
    ship !== product.cost.internationalShippingKrw;

  const apply = () => {
    if (selling !== product.sellingPriceKrw) updateProduct(product.id, { sellingPriceKrw: selling });
    if (cny !== product.cost.productCostCny || rate !== product.cost.exchangeRate || ship !== product.cost.internationalShippingKrw) {
      updateCost(product.id, draftCost, "시뮬레이터 적용");
    }
  };

  return (
    <div className="card pad">
      <div style={{ fontWeight: 700, marginBottom: 4 }}>손익 시뮬레이터</div>
      <div className="tiny muted" style={{ marginBottom: 14 }}>값을 바꾸면 예상 손익이 즉시 계산됩니다. "적용"하면 저장돼요.</div>
      <div className="form-grid">
        <Num label="판매가 (원)" v={selling} set={setSelling} />
        <Num label="1688 상품가 (¥)" v={cny} set={setCny} />
        <Num label="환율 (원/¥)" v={rate} set={setRate} />
        <Num label="국제배송비 (원)" v={ship} set={setShip} />
      </div>
      <div className="kv-grid" style={{ marginTop: 14 }}>
        <KV k="셀러 총원가" v={formatKrw(sim.sellerCostKrw)} />
        <KV k="예상 순이익" v={formatKrw(sim.netProfitKrw)} accent={sim.netProfitKrw < 0 ? "var(--loss)" : "var(--safe)"} />
        <KV k="순이익률" v={formatPct(sim.marginPct)} accent={sim.marginPct < product.minMarginPct ? "var(--warn)" : "var(--safe)"} />
        <KV k="손익분기가" v={formatKrw(sim.breakEvenPriceKrw)} />
      </div>
      <div className="btn-row" style={{ marginTop: 14 }}>
        <button className="btn primary sm" disabled={!changed} onClick={apply}>적용 (저장)</button>
        <button className="btn sm" disabled={!changed} onClick={() => { setSelling(product.sellingPriceKrw); setCny(product.cost.productCostCny); setRate(product.cost.exchangeRate); setShip(product.cost.internationalShippingKrw); }}>되돌리기</button>
      </div>
    </div>
  );
}

function SupplierPanel({ product }: { product: Product }) {
  const opts: SupplierStock[] = ["IN_STOCK", "LOW_STOCK", "OUT_OF_STOCK", "UNKNOWN", "DATA_UNAVAILABLE"];
  return (
    <div className="card pad">
      <div style={{ fontWeight: 700, marginBottom: 4 }}>공급처 상태</div>
      <div className="tiny muted" style={{ marginBottom: 12 }}>공급처(1688) 재고 상태. 품절이면 발주가 자동 차단됩니다.</div>
      <div className="field">
        <label>공급처 재고 상태</label>
        <select value={product.supplierStock} onChange={(e) => setSupplierStock(product.id, e.target.value as SupplierStock)}>
          {opts.map((o) => <option key={o} value={o}>{SUPPLIER_STOCK_META[o]} ({o})</option>)}
        </select>
      </div>
      <label className="tiny" style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, cursor: "pointer" }}>
        <input type="checkbox" checked={product.legalBlock} onChange={(e) => updateProduct(product.id, { legalBlock: e.target.checked, legalNote: e.target.checked ? "수동 차단" : undefined })} />
        법적/통관 차단 (짝퉁·KC·목록통관 배제 등)
      </label>
    </div>
  );
}

function CostHistory({ product }: { product: Product }) {
  const hist = product.costHistory.slice(-8);
  const max = Math.max(...hist.map((h) => h.productPriceKrw), 1);
  const first = hist[0]?.productPriceKrw ?? 0;
  const last = hist[hist.length - 1]?.productPriceKrw ?? 0;
  const rising = last > first;
  return (
    <div className="card pad">
      <div style={{ fontWeight: 700, marginBottom: 4 }}>원가 변동</div>
      <div className="tiny muted" style={{ marginBottom: 12 }}>
        {hist.length > 1 && rising
          ? `⚠️ 원가가 ${formatKrw(first)} → ${formatKrw(last)}로 상승`
          : "최근 원가 추이"}
      </div>
      <div className="spark">
        {hist.map((h, i) => (
          <div key={i} className={"bar" + (rising ? " up" : "")} style={{ height: `${(h.productPriceKrw / max) * 100}%` }} title={`${formatKrw(h.productPriceKrw)}`} />
        ))}
      </div>
    </div>
  );
}

function OrderHistory({ id }: { id: string }) {
  useStore();
  const orders = getOrdersFor(id);
  if (orders.length === 0) return null;
  return (
    <>
      <div className="section-title">주문 이력 (주문 시점 손익 스냅샷)</div>
      <div className="card pad">
        <div className="timeline">
          {orders.map((o) => (
            <div key={o.id} className="tl">
              <span className="time">{new Date(o.createdAt).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
              <span className="tag">{o.preflightStatus}</span>
              <span style={{ flex: 1 }}>
                판매가 {formatKrw(o.snapshot.selling_price_snapshot)} · 원가 {formatKrw(o.snapshot.source_cost_snapshot)} ·{" "}
                <b style={{ color: o.snapshot.expected_profit_snapshot < 0 ? "var(--loss)" : "var(--safe)" }}>
                  손익 {formatKrw(o.snapshot.expected_profit_snapshot)}
                </b>
                {o.approved && " · 승인"}
              </span>
            </div>
          ))}
        </div>
        <div className="tiny muted" style={{ marginTop: 10 }}>※ 스냅샷은 발주 당시 값으로 영구 보존되며, 이후 원가가 변해도 바뀌지 않습니다.</div>
      </div>
    </>
  );
}

function EventLog({ product }: { product: Product }) {
  const events = product.events.slice(0, 12);
  return (
    <>
      <div className="section-title">이벤트 로그</div>
      <div className="card pad">
        <div className="timeline">
          {events.map((e, i) => (
            <div key={i} className="tl">
              <span className="time">{new Date(e.at).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
              <span className="tag">{e.type}</span>
              <span style={{ flex: 1 }}>{e.message}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function KV({ k, v, accent }: { k: string; v: string; accent?: string }) {
  return (
    <div className="kv">
      <div className="k">{k}</div>
      <div className="v" style={accent ? { color: accent } : undefined}>{v}</div>
    </div>
  );
}

function Num({ label, v, set }: { label: string; v: number; set: (n: number) => void }) {
  return (
    <div className="field">
      <label>{label}</label>
      <input type="number" value={v} onChange={(e) => set(+e.target.value)} />
    </div>
  );
}
