import { useState } from "react";
import { makeProduct, type NewProductInput } from "../domain/factory";
import { computeProfit, recommendSellingPrice } from "../domain/profitEngine";
import { addProduct } from "../store/db";
import { formatKrw, formatPct } from "../domain/money";
import type { Marketplace } from "../domain/types";

type PriceMode = "target" | "manual";

export function AddProductForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [market, setMarket] = useState<Marketplace>("NAVER");
  const [mode, setMode] = useState<PriceMode>("target");
  const [targetMargin, setTargetMargin] = useState(30);
  const [selling, setSelling] = useState(12900);
  const [cny, setCny] = useState(22);
  const [rate, setRate] = useState(190);
  const [ship, setShip] = useState(1800);
  const [minMargin, setMinMargin] = useState(15);

  const baseInput: NewProductInput = {
    name: name || "새 상품",
    sourceUrl: url,
    marketplace: market,
    sellingPriceKrw: 0,
    productCostCny: Number(cny) || 0,
    exchangeRate: Number(rate) || 0,
    internationalShippingKrw: Number(ship) || 0,
    minMarginPct: Number(minMargin) || 0,
  };
  const base = makeProduct(baseInput);
  const recommended = recommendSellingPrice(base.cost, Number(targetMargin) || 0);
  const recOk = Number.isFinite(recommended);
  const effectiveSelling = mode === "target" ? (recOk ? recommended : 0) : Number(selling) || 0;

  const profit = computeProfit(effectiveSelling, base.cost, {
    customsThresholdKrw: base.customsThresholdKrw,
    dutyRatePct: base.dutyRatePct,
  });

  const submit = () => {
    if (!name.trim()) { alert("상품명을 입력해 주세요."); return; }
    if (effectiveSelling <= 0) { alert("판매가를 확인해 주세요."); return; }
    addProduct(makeProduct({ ...baseInput, sellingPriceKrw: effectiveSelling }));
    onDone();
  };

  return (
    <div>
      <div className="section-title">상품 추가</div>
      <div className="pill-info" style={{ marginBottom: 16 }}>
        1688 원가만 넣으면 됩니다. 판매가를 모르면 <b>"목표 마진으로 자동 계산"</b>을 쓰세요 —
        검색 없이 원가·수수료·배송비를 역산해 <b>권장 판매가</b>를 알려줍니다.
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
        </div>
      </div>

      {/* ---------- 판매가 결정 ---------- */}
      <div className="section-title">판매가 정하기</div>
      <div className="card pad">
        <div className="nav" style={{ marginBottom: 16 }}>
          <button className={mode === "target" ? "active" : ""} onClick={() => setMode("target")}>
            목표 마진으로 자동 계산 (추천)
          </button>
          <button className={mode === "manual" ? "active" : ""} onClick={() => setMode("manual")}>
            판매가 직접 입력
          </button>
        </div>

        {mode === "target" ? (
          <>
            <div className="form-grid">
              <div className="field">
                <label>목표 순이익률 (%)</label>
                <input type="number" value={targetMargin} onChange={(e) => setTargetMargin(+e.target.value)} />
                <span className="hint">이만큼 남기고 싶다 → 판매가를 역산</span>
              </div>
              <div className="field">
                <label>권장 판매가</label>
                <div style={{
                  padding: "10px 12px", borderRadius: 10, fontWeight: 800, fontSize: 20,
                  background: recOk ? "var(--accent-soft)" : "var(--loss-bg)",
                  color: recOk ? "var(--accent)" : "var(--loss)",
                }}>
                  {recOk ? formatKrw(recommended) : "계산 불가"}
                </div>
                {!recOk && <span className="hint">목표 마진이 수수료 대비 너무 높습니다. 낮춰보세요.</span>}
              </div>
            </div>
            <div className="warn-note" style={{ marginTop: 12, background: "var(--accent-soft)", color: "var(--accent)" }}>
              💡 이 가격은 <b>원가 기준</b>이에요. 실제로 잘 팔리려면 네이버/쿠팡에서 경쟁가도 한 번 확인하는 게 좋아요.
              (경쟁가 자동 조회는 Phase 3에서 추가됩니다.)
            </div>
          </>
        ) : (
          <div className="form-grid">
            <div className="field">
              <label>국내 판매가 (원)</label>
              <input type="number" value={selling} onChange={(e) => setSelling(+e.target.value)} />
            </div>
          </div>
        )}

        <div className="form-grid" style={{ marginTop: 4 }}>
          <div className="field">
            <label>최소 허용 순이익률 (%)</label>
            <input type="number" value={minMargin} onChange={(e) => setMinMargin(+e.target.value)} />
            <span className="hint">판매 중 이 값 아래로 떨어지면 위험 경고</span>
          </div>
        </div>
      </div>

      <div className="section-title">실시간 예상 손익</div>
      <div className="card pad">
        <div className="kv-grid">
          <KV k="적용 판매가" v={formatKrw(effectiveSelling)} />
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
        {profit.netProfitKrw < 0 && effectiveSelling > 0 && (
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
