import { useState } from "react";
import { makeProduct, type NewProductInput } from "../domain/factory";
import { computeProfit } from "../domain/profitEngine";
import { addProduct } from "../store/db";
import { formatKrw, formatPct } from "../domain/money";
import type { Marketplace } from "../domain/types";

export function AddProductForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [market, setMarket] = useState<Marketplace>("NAVER");
  const [selling, setSelling] = useState(12900);
  const [cny, setCny] = useState(22);
  const [rate, setRate] = useState(190);
  const [ship, setShip] = useState(1800);
  const [minMargin, setMinMargin] = useState(15);

  const input: NewProductInput = {
    name: name || "새 상품",
    sourceUrl: url,
    marketplace: market,
    sellingPriceKrw: Number(selling) || 0,
    productCostCny: Number(cny) || 0,
    exchangeRate: Number(rate) || 0,
    internationalShippingKrw: Number(ship) || 0,
    minMarginPct: Number(minMargin) || 0,
  };
  const preview = makeProduct(input);
  const profit = computeProfit(preview.sellingPriceKrw, preview.cost, {
    customsThresholdKrw: preview.customsThresholdKrw,
    dutyRatePct: preview.dutyRatePct,
  });

  const submit = () => {
    if (!name.trim()) { alert("상품명을 입력해 주세요."); return; }
    addProduct(makeProduct(input));
    onDone();
  };

  return (
    <div>
      <div className="section-title">상품 추가</div>
      <div className="pill-info" style={{ marginBottom: 16 }}>
        1688 상품을 국내 마켓에 올리기 전, 원가와 판매가를 넣으면 <b>예상 순이익이 실시간 계산</b>됩니다.
        수수료·배송비 등은 합리적 기본값이 들어가 있어 초보자도 바로 쓸 수 있어요.
      </div>

      <div className="card pad">
        <div className="form-grid">
          <div className="field full">
            <label>상품명</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 차량용 무선 핸드폰 거치대" />
          </div>
          <div className="field full">
            <label>1688 상품 URL <span className="hint">(선택)</span></label>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://detail.1688.com/offer/..." />
          </div>
          <div className="field">
            <label>판매 마켓</label>
            <select value={market} onChange={(e) => setMarket(e.target.value as Marketplace)}>
              <option value="NAVER">네이버 스마트스토어</option>
              <option value="COUPANG">쿠팡</option>
              <option value="11ST">11번가</option>
              <option value="GMARKET">G마켓</option>
              <option value="OTHER">기타</option>
            </select>
          </div>
          <div className="field">
            <label>국내 판매가 (원)</label>
            <input type="number" value={selling} onChange={(e) => setSelling(+e.target.value)} />
          </div>
          <div className="field">
            <label>1688 상품가 (위안 ¥)</label>
            <input type="number" value={cny} onChange={(e) => setCny(+e.target.value)} />
          </div>
          <div className="field">
            <label>환율 (원/위안)</label>
            <input type="number" value={rate} onChange={(e) => setRate(+e.target.value)} />
          </div>
          <div className="field">
            <label>국제배송비 (원)</label>
            <input type="number" value={ship} onChange={(e) => setShip(+e.target.value)} />
          </div>
          <div className="field">
            <label>최소 허용 순이익률 (%)</label>
            <input type="number" value={minMargin} onChange={(e) => setMinMargin(+e.target.value)} />
            <span className="hint">이 값 아래로 떨어지면 위험 경고</span>
          </div>
        </div>
      </div>

      <div className="section-title">실시간 예상 손익</div>
      <div className="card pad">
        <div className="kv-grid">
          <KV k="물품가(원화)" v={formatKrw(profit.productPriceKrw)} />
          <KV k="셀러 총원가" v={formatKrw(profit.sellerCostKrw)} />
          <KV k="예상 순이익" v={formatKrw(profit.netProfitKrw)} accent={profit.netProfitKrw < 0 ? "var(--loss)" : "var(--safe)"} />
          <KV k="순이익률" v={formatPct(profit.marginPct)} accent={profit.marginPct < minMargin ? "var(--warn)" : "var(--safe)"} />
          <KV k="손익분기 판매가" v={formatKrw(profit.breakEvenPriceKrw)} />
        </div>
        {profit.customs.overThreshold && (
          <div className="warn-note" style={{ marginTop: 12 }}>
            ⚠️ 물품가가 면세 한도(약 20만원)를 초과합니다. 관부가세(고객 부담) 추정 {formatKrw(profit.customs.customerTaxBurdenKrw)} — 전환율·클레임 검토 필요.
          </div>
        )}
        {profit.netProfitKrw < 0 && (
          <div className="warn-note" style={{ marginTop: 12, background: "var(--loss-bg)", color: "var(--loss)" }}>
            🔴 현재 조건은 손실입니다. 판매가를 올리거나 더 싼 공급처를 검토하세요.
          </div>
        )}
      </div>

      <div className="btn-row" style={{ marginTop: 18 }}>
        <button className="btn primary" onClick={submit}>상품 등록</button>
        <button className="btn" onClick={onDone}>취소</button>
      </div>
    </div>
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
